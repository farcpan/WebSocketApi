import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';

export interface StageParameters {
	db: {
		targetTableName: string;
	};
	api: {
		stageName: string;
	};
}

export class ContextParameters {
	systemName: string;
	env: string;
	stage: string;
	version: string;
	stageParameters: StageParameters;

	constructor(app: cdk.App) {
		this.systemName = app.node.tryGetContext('systemName');
		this.env = app.node.tryGetContext('env');
		this.stage = app.node.tryGetContext('stage');
		this.version = app.node.tryGetContext('version');
		console.log(`systemName: ${this.systemName}`);
		console.log(`env: ${this.env}`);
		console.log(`stage: ${this.stage}`);
		console.log(`version: ${this.version}`);

		const filePath = __dirname + `/../cdk.${this.stage}.json`;
		this.stageParameters = JSON.parse(fs.readFileSync(filePath).toString()) as StageParameters;
		console.log('StageParameters: ');
		console.log(this.stageParameters);
	}

	public getResourceId = (resourceName: string): string => {
		return this.systemName + '-' + this.env + '-' + this.stage + '-' + resourceName;
	};
}
