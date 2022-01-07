import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';

interface EcommerApiStackProps extends cdk.StackProps {
  productsHandler: lambdaNodeJS.NodejsFunction
}

export class EcommerceApiStack  extends cdk.Stack {

  constructor(scope: Construct, id: string, props: EcommerApiStackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, "ecommerce-api", {
      restApiName: 'Ecommerce Service',      
    });

    const productFunctionIntegration = new apigateway.LambdaIntegration(props.productsHandler)
    // REST
    // /products - REST service
    const productsResource = api.root.addResource('products');
    // GET /products - REST operation
    productsResource.addMethod('GET', productFunctionIntegration);

    //POST /products
    productsResource.addMethod('POST', productFunctionIntegration);
    
    const productIdResource = productsResource.addResource("{id}");
    
    //GET /products/{id}
    productIdResource.addMethod('GET', productFunctionIntegration);
    //PUT /products/{id}
    productIdResource.addMethod('PUT', productFunctionIntegration);
    //DELETE /products/{id}
    productIdResource.addMethod('DELETE', productFunctionIntegration);

  }

}