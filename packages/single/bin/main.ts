import * as cdk from "aws-cdk-lib";
import { EsSingleStack } from "../lib/stack/es-single-stack";
import { devParam } from "../lib/param/parameter";

const app = new cdk.App();

const _esSingleStack = new EsSingleStack(app, "Single", {
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
