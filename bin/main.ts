import * as cdk from "aws-cdk-lib";
import { EsOnEc2Stack } from "../lib/stack/cdk-es-on-ec2-stack";

const app = new cdk.App();

new EsOnEc2Stack(app, "EsOnEc2Stack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
