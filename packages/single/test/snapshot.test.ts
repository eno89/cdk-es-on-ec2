import * as cdk from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { EsSingleStack } from "../lib/stack/es-single-stack";
import { devParam } from "../lib/param/parameter";

test(`Snapshot Test`, () => {
  const app = new cdk.App();

  app.node.setContext("globalIp", "172.0.0.1/32");

  // When
  const esSingleStack = new EsSingleStack(app, "Single", {
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
  expect(Template.fromStack(esSingleStack)).toMatchSnapshot();
});
