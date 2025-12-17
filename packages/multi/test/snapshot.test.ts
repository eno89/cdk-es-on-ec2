import * as cdk from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { EsMultiStack } from "../lib/stack/es-multi-stack";
import { devParam } from "../lib/param/parameter";

test(`Snapshot Test`, () => {
  const app = new cdk.App();

  app.node.setContext("globalIp", "172.0.0.1/32");
  app.node.setContext(
    "acmCertArn",
    "arn:aws:acm:ap-northeast-1:111111111111:certificate/00000000-0000-0000-0000-000000000000"
  );

  // When
  const esMultiStack = new EsMultiStack(app, "Multi", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    stackName: `${devParam.getPrefixPascal()}Main`,
    description: "Single ES",
    tags: {
      Project: devParam.projectName,
      Environment: devParam.envName,
    },
    param: devParam,
  });

  // Then
  expect(Template.fromStack(esMultiStack)).toMatchSnapshot();
});
