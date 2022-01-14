import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';




interface ProductsFunctionStackProps extends cdk.StackProps {
  productsDdb : dynamodb.Table;
  eventsDdb: dynamodb.Table;
}

export class ProductsFunctionStack extends cdk.Stack {
  // permite acesso para outras stacks
  readonly productsHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: ProductsFunctionStackProps) {
    super(scope, id, props);

    const productEventsHandler = new lambdaNodeJS.NodejsFunction(this, "ProductEventsFunction", {
      functionName: "ProductEventsFunction",
      entry: "lambda/products/productEventsFunction.js", // referente a raiz do projeto
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

    // permite apenas escrita pela função productEventsHandler
    props.eventsDdb.grantWriteData(productEventsHandler);

    this.productsHandler = new lambdaNodeJS.NodejsFunction(this, "ProductsFunction", {
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
        PRODUCTS_DDB: props.productsDdb.tableName,
        PRODUCTS_EVENTS_FUNCTION_NAME: productEventsHandler.functionName // obtem o nome da funcao como env
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0       
    });

    props.productsDdb.grantReadWriteData(this.productsHandler);
    // garante permissão de invocação  da função de eventos para função de produtos
    productEventsHandler.grantInvoke(this.productsHandler);
  }

}