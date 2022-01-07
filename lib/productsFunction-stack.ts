import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';




interface ProductsFunctionStackProps extends cdk.StackProps {
  productsDdb : dynamodb.Table
}

export class ProductsFunctionStack extends cdk.Stack {
  // permite acesso para outras stacks
  readonly handler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: ProductsFunctionStackProps) {
    super(scope, id, props);
    this.handler = new lambdaNodeJS.NodejsFunction(this, "ProductsFunction", {
      functionName: "ProductsFunction",
      entry: "lambda/products/productsFunction.js", // referente a raiz do projeto
      handler: "handler",
      bundling: {
        minify: true,
        sourceMap: false,
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        PRODUCTS_DDB: props.productsDdb.tableName
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0       
    })

    props.productsDdb.grantReadWriteData(this.handler);
  }

}