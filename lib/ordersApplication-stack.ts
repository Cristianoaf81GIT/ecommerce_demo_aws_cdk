import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSource from 'aws-cdk-lib/aws-lambda-event-sources';


interface OrdersApplicationStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
  eventsDdb: dynamodb.Table;  
}


export class OrdersApplicationStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;
  readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: OrdersApplicationStackProps) {
    super(scope, id, props);


    const ordersDdb = new dynamodb.Table(this, 'OrdersDdb', {
      tableName: 'orders',
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING
      },      
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1
    });

    const ordersTopic = new sns.Topic(this, 'OrderEventsTopic', {
      topicName: 'order-events'
    });

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
      functionName: "OrdersFunction",
      entry: "lambda/orders/ordersFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        PRODUCTS_DDB: props.productsDdb.tableName,
        ORDERS_DDB: ordersDdb.tableName,
        ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0       
    });

    const orderEventHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFunction", {
      functionName: "OrderEventsFunction",
      entry: "lambda/orders/orderEventsFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0       
    });

    const billingHandler = new lambdaNodeJS.NodejsFunction(this, "BillingFunction", {
      functionName: "BillingFunction",
      entry: "lambda/orders/billingFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),     
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      deadLetterQueueEnabled: true,             
    });


    props.productsDdb.grantReadData(this.ordersHandler);
    ordersDdb.grantReadWriteData(this.ordersHandler);
    ordersTopic.grantPublish(this.ordersHandler);
    ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventHandler));
    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [props.eventsDdb.tableArn],
      actions: ["dynamodb:PutItem"],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#order_*']
        }
      }
    });
    orderEventHandler.addToRolePolicy(eventsDdbPolicy);
    ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
      filterPolicy: {
        eventType: sns.SubscriptionFilter.stringFilter({
          allowlist: ['ORDER_CREATED']
        })
      }
    }));

    // dead letter queue para fila orderEventsQueue
    const orderEventsDlq = new sqs.Queue(this, 'OrderEventsDlq', {
      queueName: 'order-events-dlq',
      retentionPeriod: cdk.Duration.days(10)
    });

    // cria a fila
    const orderEventsQueue = new sqs.Queue(this, 'OrderEventsQueue', {
      queueName: 'order-events',
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: orderEventsDlq
      }
    });

    // adiciona inscrição da fila aos topicos
    ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue, {
      filterPolicy: {
        eventType: sns.SubscriptionFilter.stringFilter({
          allowlist: ['ORDER_CREATED']
        }),
      }
    }));

    // cria funcao para envio de email
    const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEmailsFunction", {
      functionName: "OrderEmailsFunction",
      entry: "lambda/orders/orderEmailsFunction.js", // referente a raiz do projeto
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

    // adiciona uma fonte de eventos nesse caso a fila criada anteriormente
    orderEmailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(orderEventsQueue, /*{
      enabled: true,
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.minutes(1)
    }*/));

    // adiciona permissão para ler as mensagens da fila
    orderEventsQueue.grantConsumeMessages(orderEmailsHandler);

    // cria politica permitindo envio de email
    const orderEmailsSesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    });
    
    // adiciona permissão de envio de email para função lambda orderEmailsHandler
    orderEmailsHandler.addToRolePolicy(orderEmailsSesPolicy);


    this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFetchFunction", {
      functionName: "OrderEventsFetchFunction",
      entry: "lambda/orders/orderEventsFetchFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0       
    });
    
    const eventsFetchDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Query'],
      resources: [`${props.eventsDdb.tableArn}/index/emailIndex`]
    });

    this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy);

  }
}