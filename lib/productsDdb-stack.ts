import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';


export class ProductsDdbStack extends cdk.Stack {

  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // parâmetros obrigatórios
    this.table = new dynamodb.Table(this, 'ProductsDdb', {
      tableName: 'products',
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING
      }, // chave primaria
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1
    });
  }

}