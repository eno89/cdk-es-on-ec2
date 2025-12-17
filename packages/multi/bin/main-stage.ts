import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { EsMultiStack } from "../lib/stack/es-multi-stack";
import { devParam, AppParam } from "../lib/param/parameter";
import * as fs from "fs";
import * as path from "path";

const app = new cdk.App();

const isQuiet = (app.node.tryGetContext("isQuiet") || "false") === "true";
if (isQuiet) {
  console.log = console.info = () => {};
}

export class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: AppParam) {
    super(scope, id, props);

    const _esMultiStack = new EsMultiStack(app, "Multi", {
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
  }
}

const _dev = new.AppStage(app, "Dev", devParam);
