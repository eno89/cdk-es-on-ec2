import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AppParam, devParam } from "../param/parameter";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2tg from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as fs from "fs";

export interface EsMultiStackProps extends cdk.StackProps {
  param: AppParam;
}

export class EsMultiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: EsMultiStackProps) {
    super(scope, id, props);

    // # GetContext
    // - IP
    // - curl https://checkip.amazonaws.com
    const globalIpCidr = this.node.tryGetContext("globalIp") || "127.0.0.1/32";

    // # S3
    const bucket = new s3.Bucket(this, `Bucket`, {
      bucketName: `${devParam.getPrefixKebab()}-copy-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      accessControl: s3.BucketAccessControl.PRIVATE,
    });
    new cdk.CfnOutput(this, `OutBucekt`, { value: bucket.bucketName });

    // # VPC
    const vpc = new ec2.Vpc(this, `Vpc`, {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/24"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          // - Public
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 26,
        },
        {
          // - Private
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 26,
        },
      ],
    });

    // # SG
    const esSg = new ec2.SecurityGroup(this, "EsSg", {
      vpc,
      allowAllOutbound: true,
      description: "Es/Kibana SG",
    });
    esSg.addIngressRule(esSg, ec2.Port.tcp(9300), "ES inter-node");
    esSg.addIngressRule(esSg, ec2.Port.tcp(9200), "ES REST");
    esSg.addIngressRule(esSg, ec2.Port.tcp(5044), "Logstash beats");
    esSg.addIngressRule(esSg, ec2.Port.tcp(5601), "Kibana");

    // # IAM Role
    const role = new iam.Role(this, "EsEc2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    // - SSM
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
    // - EC2 discorvery
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:DescribeInstances"],
        resources: ["*"],
      })
    );
    const profile = new iam.CfnInstanceProfile(this, "EsInstanceProfile", {
      roles: [role.roleName],
    });
    // - S3
    bucket.grantRead(role);
    bucket.grantReadWrite(role);

    // # AMI=
    const ami = ec2.MachineImage.latestAmazonLinux2({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // # UserData
    const clusterTagKey = "Cluster";
    const clusterTagVal = "es9-cdk";
    const nodeNames = [`es-node-1`, `es-node-2`, `es-node-3`];

    const repoText = fs.readFileSync("lib/config/elasticsearch.repo", "utf8");
    const settingEs = fs.readFileSync("lib/config/elasticsearch.yml", "utf8");
    const settingKibana = fs.readFileSync("lib/config/kibana.yml", "utf8");

    const commonUserData = (nodeName: string) => {
      const ud = ec2.UserData.forLinux();
      ud.addCommands(
        "set -eux",
        `hostnamectl set-hostname ${nodeName}`,
        // - ES 9
        "rpm --import https://artifacts.elastic.co/GPG-KEY-elasticsearch",
        "cat << EOT > /etc/yum.repos.d/elasticsearch.repo",
        repoText,
        "EOT",
        "yum install -y elasticsearch | tee elasticsearch.txt",
        "/usr/share/elasticsearch/bin/elasticsearch-plugin install --batch discovery-ec2",
        // - ES setting
        // "cat << EOT > /etc/elasticsearch/elasticsearch.yml",
        // settingEs,
        // "EOT",
        // ES JVM
        "mkdir -p /etc/elasticsearch/jvm.options.d",
        'echo "-Xms2g" >  /etc/elasticsearch/jvm.options.d/heap.options',
        'echo "-Xmx2g" >> /etc/elasticsearch/jvm.options.d/heap.options'
        // - systemctl
        //"systemctl daemon-reload"
        // "systemctl enable elasticsearch",
        // "systemctl start elasticsearch",
        // "systemctl status elasticsearch"
      );
      return ud;
    };
    // console.info(commonUserData().render()); // 確認用

    const node1Ud = commonUserData(nodeNames[0]);
    const node2Ud = commonUserData(nodeNames[1]);
    const node3Ud = commonUserData(nodeNames[2]);

    // node1Ud.addCommands(
    //   // - kibana
    //   "yum install -y kibana",
    //   "cat << EOT > /etc/kibana/kibana.yml",
    //   settingKibana,
    //   "EOT",
    //   "systemctl daemon-reload",
    //   "systemctl enable kibana",
    //   "systemctl start kibana",
    //   "systemctl status kibana",
    //   "curl http://localhost:5601",
    //   // - logstash
    //   "yum install -y logstash",
    //   "systemctl daemon-reload",
    //   "systemctl enable logstash",
    //   "systemctl start logstash",
    //   "systemctl status logstash"
    // );

    // # Instances
    const blockDevice: ec2.BlockDevice = {
      deviceName: "/dev/xvda",
      volume: ec2.BlockDeviceVolume.ebs(50, { encrypted: true }),
    };
    const subnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    }).subnets;

    const keyPair = ec2.KeyPair.fromKeyPairName(this, `KeyPair`, `es-node`);

    const mkInstance = (id: string, index: number, ud: ec2.UserData) => {
      const inst = new ec2.Instance(this, id, {
        vpc,
        vpcSubnets: {
          subnets: [subnets[index % subnets.length]],
        },
        instanceType: new ec2.InstanceType("t3.medium"),
        machineImage: ami,
        securityGroup: esSg,
        role,
        userData: ud,
        blockDevices: [blockDevice],
        keyPair,
      });
      cdk.Tags.of(inst).add(clusterTagKey, clusterTagVal);
      cdk.Tags.of(inst).add("Name", `es-node-${index + 1}`);
      (inst.node.defaultChild as ec2.CfnInstance).iamInstanceProfile = profile.ref;

      new cdk.CfnOutput(this, `OutInstanceId${id}`, { value: inst.instanceId });

      return inst;
    };

    // - Instance
    const es1 = mkInstance(`EsNode1`, 0, node1Ud);
    const es2 = mkInstance(`EsNode2`, 1, node2Ud);
    const es3 = mkInstance(`EsNode3`, 2, node3Ud);

    // - ALB
    new albAndAcm(this, `Alb`, {
      vpc,
      globalIpCidr,
      esSg,
      es1,
    });
  }
}

export class albAndAcm extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: {
      vpc: ec2.IVpc;
      globalIpCidr: string;
      esSg: ec2.ISecurityGroup;
      es1: ec2.Instance;
    }
  ) {
    super(scope, id);

    const vpc = props.vpc;
    const globalIpCidr = props.globalIpCidr;
    const esSg = props.esSg;
    const es1 = props.es1;

    // - Kibana access (Public ALB -> Private EC2)
    const acmCertArn = this.node.tryGetContext("acmCertArn");
    if (!acmCertArn || typeof acmCertArn !== "string") {
      throw new Error('CDK context "acmCertArn" is required (e.g. `cdk deploy -c acmCertArn=arn:aws:acm:...`).');
    }
    const certificate = acm.Certificate.fromCertificateArn(this, "KibanaAlbCert", acmCertArn);

    // - ALB
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      allowAllOutbound: true,
      description: "Public ALB SG for Kibana",
    });
    albSg.addIngressRule(ec2.Peer.ipv4(globalIpCidr), ec2.Port.tcp(80), "Kibana HTTP from global IP");
    albSg.addIngressRule(ec2.Peer.ipv4(globalIpCidr), ec2.Port.tcp(443), "Kibana HTTPS from global IP");
    esSg.addIngressRule(albSg, ec2.Port.tcp(5601), "Kibana from ALB");

    const alb = new elbv2.ApplicationLoadBalancer(this, "KibanaAlb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "KibanaTg", {
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 5601,
      targets: [new elbv2tg.InstanceTarget(es1, 5601)],
      healthCheck: { path: "/app/home" },
    });

    alb.addListener("Http", {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    alb.addListener("Https", {
      port: 443,
      open: false,
      certificates: [certificate],
      defaultTargetGroups: [targetGroup],
    });

    new cdk.CfnOutput(this, "OutKibanaUrl", {
      value: `https://${alb.loadBalancerDnsName}`,
    });
  }
}
