import * as aws from 'aws-sdk';

// 接続
export const connectHandler = async (event: any, context: any) => {
	const tableName = getTableName();
	if (!tableName) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no env for dynamodb table name' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	// リクエストから接続IDを取得
	const connectionId = event.requestContext.connectionId as string | undefined | null;
	if (connectionId == null) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no connectionId' }),
			headers: getCorsAllowedHeaders(),
		};
	}
	if (!connectionId) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'empty connectionId' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	// DynamoDB
	const dynamodb = new aws.DynamoDB();
	const putItemInput: aws.DynamoDB.PutItemInput = {
		TableName: tableName,
		Item: {
			Id: { S: connectionId },
		},
	};

	const result = await dynamodb.putItem(putItemInput).promise();
	if (result.$response.error) {
		return {
			statusCode: 500,
			body: JSON.stringify(result.$response.error),
			headers: getCorsAllowedHeaders(),
		};
	}

	return {
		statusCode: 200,
		body: JSON.stringify({
			timestamp: new Date().toISOString(),
		}),
		headers: getCorsAllowedHeaders(),
	};
};

// 切断
export const disconnectHandler = async (event: any, context: any) => {
	const tableName = getTableName();
	if (!tableName) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no env for dynamodb table name' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	// リクエストから接続IDを取得
	const connectionId = event.requestContext.connectionId as string | undefined | null;
	if (connectionId == null) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no connectionId' }),
			headers: getCorsAllowedHeaders(),
		};
	}
	if (!connectionId) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'empty connectionId' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	// DynamoDB
	const dynamodb = new aws.DynamoDB();
	const deleteItemInput: aws.DynamoDB.DeleteItemInput = {
		TableName: tableName,
		Key: {
			Id: { S: connectionId },
		},
	};

	const result = await dynamodb.deleteItem(deleteItemInput).promise();
	if (result.$response.error) {
		return {
			statusCode: 500,
			body: JSON.stringify(result.$response.error),
			headers: getCorsAllowedHeaders(),
		};
	}

	return {
		statusCode: 200,
		body: JSON.stringify({
			timestamp: new Date().toISOString(),
		}),
		headers: getCorsAllowedHeaders(),
	};
};

// メッセージ送信
export const sendMessageHandler = async (event: any, context: any) => {
	const body = event.body;
	if (!body) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no request body' }),
			headers: getCorsAllowedHeaders(),
		};
	}
	const requestData = JSON.parse(body) as any;
	if (!requestData.message) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no message' }),
			headers: getCorsAllowedHeaders(),
		};
	}
	const message = requestData.message as string;

	const tableName = getTableName();
	if (!tableName) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no env for dynamodb table name' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	const endpoint = getEndpointUrl();
	if (!endpoint) {
		return {
			statusCode: 400,
			body: JSON.stringify({ message: 'no env for endpoint url' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	// DynamoDB
	const dynamodb = new aws.DynamoDB();
	const result = await dynamodb.scan({ TableName: tableName }).promise();
	if (result.$response.error) {
		return {
			statusCode: 500,
			body: JSON.stringify(result.$response.error),
			headers: getCorsAllowedHeaders(),
		};
	}

	const items = result.$response.data?.Items;
	if (!items || items.length === 0) {
		return {
			statusCode: 500,
			body: JSON.stringify({ message: 'no connection ids' }),
			headers: getCorsAllowedHeaders(),
		};
	}

	const apiGateway = new aws.ApiGatewayManagementApi({ endpoint });
	const connectionIdList = items
		.map((item) => {
			return item.Id.S ?? '';
		})
		.filter((id) => {
			return id != null && id !== '';
		});
	for (let i = 0; i < connectionIdList.length; i++) {
		const connectionId = connectionIdList[i];
		const postData = {
			Data: message,
			ConnectionId: connectionId,
		};
		try {
			await apiGateway.postToConnection(postData).promise();
		} catch (e: any) {
			if (e.statusCode === 410) {
				await dynamodb
					.deleteItem({
						TableName: tableName,
						Key: { Id: { S: connectionId } },
					})
					.promise();
			}
		}
	}

	return {
		statusCode: 200,
		body: JSON.stringify({
			timestamp: new Date().toISOString(),
		}),
		headers: getCorsAllowedHeaders(),
	};
};

// 環境変数からテーブル名を取得
const getTableName = (): string | undefined => {
	return process.env['TABLE_NAME'];
};

// 環境変数からAPIURLを取得
const getEndpointUrl = (): string | undefined => {
	return process.env['ENDPOINT'];
};

// CORS用ヘッダ
const getCorsAllowedHeaders = () => {
	return {
		'Access-Control-Allow-Origin': '*',
		'Content-Type': 'application/json; charset=utf-8',
	};
};
