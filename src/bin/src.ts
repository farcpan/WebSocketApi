import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { ContextParameters } from '../lib/context';

const app = new cdk.App();

const contextParameters = new ContextParameters(app);

const apiStackId: string = contextParameters.getResourceId('api-stack');
const apiStack = new ApiStack(app, apiStackId, {
	context: contextParameters,
});
