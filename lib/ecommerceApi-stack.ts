import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';

interface EcommerApiStackProps extends cdk.StackProps {
  productsHandler: lambdaNodeJS.NodejsFunction;
  ordersHandler: lambdaNodeJS.NodejsFunction;
  orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;
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

    const ordersFunctionIntegration = new apigateway.LambdaIntegration(props.ordersHandler);
    // /orders - REST service
    //resources - /orders
    const ordersResource = api.root.addResource('orders');
    //GET /orders
    //GET /orders?email=email
    //GET /orders?email=email&orderId=orderId
    ordersResource.addMethod('GET', ordersFunctionIntegration);

    //DELETE /orders?email=email&orderId=orderId
    ordersResource.addMethod('DELETE', ordersFunctionIntegration, {
      requestParameters: {
        'method.request.querystring.email': true,
        'method.request.querystring.orderId': true
      },
      requestValidatorOptions: {
        requestValidatorName: 'Email and OrderId parameters validator',
        validateRequestParameters: true
      }
    });

    //POST /orders
    const orderRequestValidator =  new apigateway.RequestValidator(this, 'OrderRequestValidator',  {
      restApi: api,
      requestValidatorName: 'Order request validator',
      validateRequestBody: true,
    });
    const orderModel = new apigateway.Model(this, 'OrderModel', {
      restApi: api,
      modelName: 'OrderModel',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          email: {
            type: apigateway.JsonSchemaType.STRING
          },
          productIds: {
            type: apigateway.JsonSchemaType.ARRAY,
            minItems: 1,
            items: {
              type: apigateway.JsonSchemaType.STRING
            }
          },
          payment: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ["CASH", "DEBIT_CARD", "CREDIT_CART"]
          }
        },
        required: [
          'email',
          'productIds',
          'payment'
        ]
      },      
    });
    ordersResource.addMethod('POST', ordersFunctionIntegration, {
      requestValidator: orderRequestValidator,
      requestModels: {"application/json": orderModel}
    });

    const orderEventsFetchIntegration = new apigateway.LambdaIntegration(props.orderEventsFetchHandler);
    // resource - /orders/events
    const orderEventsFetchResource = ordersResource.addResource('events');
    // GET /orders/events?email=<email>
    // GET /orders/events?email=<email>&eventType=<event>    
    const orderEventsFetchValidator = new apigateway.RequestValidator(this, 'OrderEventsFetchValidator', {
      restApi: api,
      requestValidatorName: 'OrderEventsFetchValidator',
      validateRequestParameters: true,
    });

    orderEventsFetchResource.addMethod('GET', orderEventsFetchIntegration, {
      requestParameters: {
        'method.request.querystring.email': true,
      },
      requestValidator: orderEventsFetchValidator
    });

  }

}