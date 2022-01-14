import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class InvoiceAppLayersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps ) {
    super(scope, id, props);

    const invoiceTransactionLayer = new lambda.LayerVersion(this, "InvoiceTransactionLayer", {
      code: lambda.Code.fromAsset(
        'lambda/invoices/layers/invoiceTransaction'
        ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      layerVersionName: "InvoiceTransaction",
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });
    
    new ssm.StringParameter(this, "InvoiceTransactionLayerVersionArn", {
      parameterName: "InvoiceTransactionLayerVersionArn",
      stringValue: invoiceTransactionLayer.layerVersionArn
    });

    const invoiceWSConnectionLayer = new lambda.LayerVersion(this, "InvoiceWSConnetionLayer",{
      code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceWSConnection'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      layerVersionName: "InvoiceWSConnection",
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    new ssm.StringParameter(this, "InvoiceWsConnectionLayerVersionArn", {
      parameterName: "InvoiceWsConnectionLayerVersionArn",
      stringValue: invoiceWSConnectionLayer.layerVersionArn
    });
  }
}