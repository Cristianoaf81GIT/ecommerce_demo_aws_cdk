import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambdaEventSources  from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';

interface InvoiceApiStackProps extends cdk.StackProps {
  eventsDdb: dynamodb.Table;
}


export class InvoiceWSApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InvoiceApiStackProps ) {
    super(scope, id, props);

    

    const invoiceTransactionLayerArn = ssm
      .StringParameter
      .valueForStringParameter(this, 'InvoiceTransactionLayerVersionArn');

    const invoiceTransactionLayer = lambda
      .LayerVersion
      .fromLayerVersionArn(
        this, 
        'InvoiceTransactionLayer', 
        invoiceTransactionLayerArn
      );

    const invoiceWSConnectionLayerArn = ssm
      .StringParameter.valueForStringParameter(this, 'InvoiceWsConnectionLayerVersionArn');

    const invoiceWSConnectionLayer = lambda
      .LayerVersion
      .fromLayerVersionArn(this, 
        "InvoiceWSConnectionLayer", 
        invoiceWSConnectionLayerArn
      );


    // invoice and invoid transaction ddb
    const invoicesDdb = new dynamodb.Table(this, 'InvoicesDdb', {
      tableName: 'invoices',
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING
      },
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // invoice bucket
    const bucket = new s3.Bucket(this, 'InvoiceBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    // websocket connection  and disconnectionh handler
    const connectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceConnectionFunction", {
      functionName: "InvoiceConnetionFunction",
      entry: "lambda/invoices/invoiceConnectionFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),     
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0       
    });
    
    // websocket api
    const webSocketApi = new apigatewayv2.WebSocketApi(this, "InvoiceWSApi", {
      apiName: "InvoiceWSApi",
      connectRouteOptions: {
        integration: new apigatewayv2_integrations
        .WebSocketLambdaIntegration("ConnectionHandler", connectionHandler)
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2_integrations
        .WebSocketLambdaIntegration("DisconnectionHandler", connectionHandler)
      }      
    });
    
    const stage = 'prod';
    const wsApiEndPoint = `${webSocketApi.apiEndpoint}/${stage}`;
    new apigatewayv2.WebSocketStage(this, 'InvoiceWSApiStage', {
      webSocketApi: webSocketApi,
      stageName: stage,
      autoDeploy: true
    });
    
    // invoice URL handler
    const getUrlHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceGetUrlFunction", {
      functionName: "InvoiceGetUrlFunction",
      entry: "lambda/invoices/invoiceGetUrlFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),     
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 ,
      environment: {
        INVOICES_DDB: invoicesDdb.tableName,
        BUCKET_NAME: bucket.bucketName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndPoint
      },
      layers: [invoiceTransactionLayer, invoiceWSConnectionLayer]      
    });
    
    const invoicesDdbWriteTransactionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [invoicesDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#transaction']
        }
      }
    });

    getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionPolicy);
    
    const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject'],
      resources: [`${bucket.bucketArn}/*`]
    });

    getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy);
    const resourcePost = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/POST/@connections/*`;
    const resourceGet = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/GET/@connections/*`;
    const resourceDelete = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/DELETE/@connections/*`; 
    const wsApiPolicy = new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["execute-api:ManageConnections"],
    resources: [resourcePost, resourceGet, resourceDelete],
    });

    getUrlHandler.addToRolePolicy(wsApiPolicy);
    
    // Invoice import handler
    const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceImportFunction", {
      functionName: "InvoiceImportFunction",
      entry: "lambda/invoices/invoiceImportFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),     
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 ,
      environment: {
        INVOICES_DDB: invoicesDdb.tableName,        
        INVOICE_WSAPI_ENDPOINT: wsApiEndPoint
      },
      layers: [invoiceTransactionLayer, invoiceWSConnectionLayer]      
    });

    invoicesDdb.grantReadWriteData(invoiceImportHandler);
    bucket
      .addEventNotification(
        s3.EventType.OBJECT_CREATED_PUT, 
        new s3n.LambdaDestination(invoiceImportHandler)
      );

    const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:DeleteObject', 's3:GetObject'],
      resources: [`${bucket.bucketArn}/*`]
    });
    invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy);
    invoiceImportHandler.addToRolePolicy(wsApiPolicy);

  

    // websocket api routes
    webSocketApi.addRoute('getImportUrl', {
      integration: new apigatewayv2_integrations
        .WebSocketLambdaIntegration('GetUrlHandler', getUrlHandler)
    });

    const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceEventsFunction", {
      functionName: "InvoiceEventsFunction",
      entry: "lambda/invoices/InvoiceEventsFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),     
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndPoint
      },
      layers: [invoiceWSConnectionLayer]     
    });

    const invoiceEventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#invoice_*']
        }
      }
    });

    invoiceEventsHandler.addToRolePolicy(invoiceEventsDdbPolicy);
    invoiceEventsHandler.addToRolePolicy(wsApiPolicy);

    // adiona ddb como streaming de função
    const invoiceEventsDlq = new sqs.Queue(this, "InvoiceEventsDlq", {
      queueName: "invoice-events-dlq",
      retentionPeriod: cdk.Duration.days(10),
    });

    invoiceEventsHandler.addEventSource(new lambdaEventSources.DynamoEventSource(invoicesDdb, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 5,
      bisectBatchOnError: true,
      onFailure: new SqsDlq(invoiceEventsDlq),
      retryAttempts: 3
    }));
  }
}