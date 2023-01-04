import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as path from 'path';
import { ContextParameters } from './context';

export interface ApiStackProps extends cdk.StackProps {
	context: ContextParameters;
}

export class ApiStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: ApiStackProps) {
		super(scope, id, props);

		// DynamoDB
		const targetTableId: string = props.context.getResourceId('websocket-api-table');
		const targetTableName: string = props.context.stageParameters.db.targetTableName;
		const targetTable: dynamodb.Table = new dynamodb.Table(this, targetTableId, {
			tableName: targetTableName,
			partitionKey: {
				name: 'Id',
				type: dynamodb.AttributeType.STRING,
			},
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		// Lambda
		const lambdaFunctionPath: string = path.join(__dirname, '../lambda/index.ts');
		const connectLambdaId: string = props.context.getResourceId('connect-lambda');
		const disconnectlambdaId: string = props.context.getResourceId('disconnect-lambda');
		const sendMessageLambdaId: string = props.context.getResourceId('sendmessage-lambda');
		const connectLambda = new NodejsFunction(this, connectLambdaId, {
			functionName: connectLambdaId,
			entry: lambdaFunctionPath,
			handler: 'connectHandler',
			environment: {
				TABLE_NAME: props.context.stageParameters.db.targetTableName,
			},
		});
		const disconnectLambda = new NodejsFunction(this, disconnectlambdaId, {
			functionName: disconnectlambdaId,
			entry: lambdaFunctionPath,
			handler: 'disconnectHandler',
			environment: {
				TABLE_NAME: props.context.stageParameters.db.targetTableName,
			},
		});
		targetTable.grantReadWriteData(connectLambda); // Lambda -> DynamoDB access
		targetTable.grantReadWriteData(disconnectLambda);

		// Lambda呼び出し用のロール
		const policy = new iam.PolicyStatement({
			effect: iam.Effect.ALLOW,
			resources: [connectLambda.functionArn, disconnectLambda.functionArn],
			actions: ['lambda:InvokeFunction'],
		});
		const roleId: string = props.context.getResourceId('lambda-role');
		const role = new iam.Role(this, roleId, {
			assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
		});
		role.addToPolicy(policy);

		// API Gateway
		const webSocketApiId: string = props.context.getResourceId('websocket-api');
		const webSocketApi = new apigw.CfnApi(this, webSocketApiId, {
			name: webSocketApiId,
			protocolType: 'WEBSOCKET',
			routeSelectionExpression: '$request.body.action',
		});

		// Lambda Integration
		const region = 'ap-northeast-1';
		const stageName: string = props.context.stageParameters.api.stageName;

		const connectLambdaIntegrationId: string = props.context.getResourceId(
			'connect-lambda-integration'
		);
		const disconnectLambdaIntegrationId: string = props.context.getResourceId(
			'disconnect-lambda-integration'
		);

		const connectLambdaIntegration = new apigw.CfnIntegration(
			this,
			connectLambdaIntegrationId,
			{
				apiId: webSocketApi.ref,
				integrationType: 'AWS_PROXY',
				integrationUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${connectLambda.functionArn}/invocations`,
				credentialsArn: role.roleArn,
			}
		);
		const disconnectLambdaIntegration = new apigw.CfnIntegration(
			this,
			disconnectLambdaIntegrationId,
			{
				apiId: webSocketApi.ref,
				integrationType: 'AWS_PROXY',
				integrationUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${disconnectLambda.functionArn}/invocations`,
				credentialsArn: role.roleArn,
			}
		);

		// WebSocketAPI ルート定義
		const connectRouteId: string = props.context.getResourceId('connect-route');
		const disconnectRouteId: string = props.context.getResourceId('disconnect-route');
		const connectRoute = new apigw.CfnRoute(this, connectRouteId, {
			apiId: webSocketApi.ref,
			routeKey: '$connect',
			authorizationType: 'NONE',
			target: 'integrations/' + connectLambdaIntegration.ref,
		});
		const disconnectRoute = new apigw.CfnRoute(this, disconnectRouteId, {
			apiId: webSocketApi.ref,
			routeKey: '$disconnect',
			authorizationType: 'NONE',
			target: 'integrations/' + disconnectLambdaIntegration.ref,
		});

		// メッセージ送信用Lambda+API設定
		const resource = `arn:aws:execute-api:${region}:${this.account}:${webSocketApi.ref}/${stageName}/POST/@connections/*`;
		const sendMessagePolicy = new iam.PolicyStatement({
			effect: iam.Effect.ALLOW,
			resources: [resource],
			actions: ['execute-api:ManageConnections'],
		});
		const sendMessageRoleId: string = props.context.getResourceId('sendmessage-role');
		const sendMessageRole = new iam.Role(this, sendMessageRoleId, {
			assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
		});
		sendMessageRole.addToPolicy(sendMessagePolicy);
		sendMessageRole.addManagedPolicy(
			iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
		);
		const apiEndpointBase = `${webSocketApi.attrApiId}.execute-api.${region}.amazonaws.com/${stageName}`;
		const sendMessageLambda = new NodejsFunction(this, sendMessageLambdaId, {
			functionName: sendMessageLambdaId,
			entry: lambdaFunctionPath,
			handler: 'sendMessageHandler',
			role: sendMessageRole,
			environment: {
				TABLE_NAME: props.context.stageParameters.db.targetTableName,
				ENDPOINT: 'https://' + apiEndpointBase,
			},
		});
		targetTable.grantReadWriteData(sendMessageLambda);
		const sendMessageLambdaTriggerPolicy = new iam.PolicyStatement({
			effect: iam.Effect.ALLOW,
			resources: [sendMessageLambda.functionArn],
			actions: ['lambda:InvokeFunction'],
		});
		const sendMessageLambdaTriggerRoleId: string =
			props.context.getResourceId('sendmessage-lambda-role');
		const sendMessageLambdaTriggerRole = new iam.Role(this, sendMessageLambdaTriggerRoleId, {
			assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
		});
		sendMessageLambdaTriggerRole.addToPolicy(sendMessageLambdaTriggerPolicy);

		// Lambda Integration
		const sendMessageLambdaIntegrationId: string = props.context.getResourceId(
			'sendmessage-lambda-integration'
		);
		const sendMessageLambdaIntegration = new apigw.CfnIntegration(
			this,
			sendMessageLambdaIntegrationId,
			{
				apiId: webSocketApi.ref,
				integrationType: 'AWS_PROXY',
				integrationUri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${sendMessageLambda.functionArn}/invocations`,
				credentialsArn: sendMessageLambdaTriggerRole.roleArn,
			}
		);
		// メッセージ送信ルート
		const sendMessageRouteId: string = props.context.getResourceId('sendmessage-route');
		const sendMessageRoute = new apigw.CfnRoute(this, sendMessageRouteId, {
			apiId: webSocketApi.ref,
			routeKey: 'send',
			authorizationType: 'NONE',
			target: 'integrations/' + sendMessageLambdaIntegration.ref,
		});

		// APIステージ指定
		const deploymentId: string = props.context.getResourceId('api-deployment');
		const deployment = new apigw.CfnDeployment(this, deploymentId, {
			apiId: webSocketApi.ref,
		});
		const stageId: string = props.context.getResourceId('api-stage');
		const stage = new apigw.CfnStage(this, stageId, {
			apiId: webSocketApi.ref,
			autoDeploy: true,
			deploymentId: deployment.ref,
			stageName: stageName,
		});

		// WebSocketAPI URL
		const webSocketApiUrlId: string = props.context.getResourceId('websocket-api-url');
		new CfnOutput(this, webSocketApiUrlId, {
			value: 'wss://' + apiEndpointBase,
		});
	}
}
