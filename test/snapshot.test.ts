import * as cdk from "aws-cdk-lib/core";
import { EsOnEc2Stack } from "../lib/stack/cdk-es-on-ec2-stack";
import { Template } from "aws-cdk-lib/assertions";

test(`Snapshot Test`, () => {
  const app = new cdk.App();

  // When
  const esOnEc2Stack = new EsOnEc2Stack(app, "EsOnEc2Stack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  });

  // Then
  expect(Template.fromStack(esOnEc2Stack)).toMatchSnapshot();
});
