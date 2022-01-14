import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class EventsDdbStack extends cdk.Stack {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.table = new dynamodb.Table(this, 'EventsDdb', {
      tableName: 'events',
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
      // billingMode: dynamodb.BillingMode.PROVISIONED,
      // readCapacity: 1,
      // writeCapacity: 1
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "emailIndex",
      partitionKey: {
        name: "email", // campo existente na tabela
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

  }
}