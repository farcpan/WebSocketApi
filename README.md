# WebSocketApi

WebSocket API

---

## Project Setup

-   initialization

    ```
    $ mkdir src
    $ cd src
    $ cdk init app --language=typescript
    ```

-   for Lambda functions
    ```
    $ cd src
    $ npm install --save-dev esbuild
    ```

---

## Test

```
$ npm install -g wscat
```

```
$ wscat -c wss://{API ID}.execute-api.{REGION}.amazonaws.com/{STAGE NAME}
> {"action":"send","message":"Hello World!"}
```

---

## References

-   [チュートリアル: WebSocket API、Lambda、DynamoDB を使用したサーバーレスチャットアプリケーションの構築](https://docs.aws.amazon.com/ja_jp/apigateway/latest/developerguide/websocket-api-chat-app.html)
-   [CDK + API Gateway + Web Socket を使ってみた](https://dev.classmethod.jp/articles/cdk-api-gateway-web-socket/)
-   [AWS API Gateway の WebSocket API をちゃんと理解する](https://zenn.dev/mryhryki/articles/2020-12-01-aws-api-gateway-websocket)
-   [WebSocket を使ってみたくて簡単なチャットアプリを作って Google Cloud Run にデプロイしてみる](https://blog.stin.ink/articles/build-chat-app-with-websocket)

---
