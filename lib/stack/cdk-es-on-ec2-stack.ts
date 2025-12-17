import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as fs from "fs";

export class EsOnEc2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==== IP ====
    // curl https://checkip.amazonaws.com
    const globalIpCidr = this.node.tryGetContext("globalIp") || "127.0.0.1/32";

    // ==== VPC ====
    const vpc = new ec2.Vpc(this, `Vpc`, {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    // ==== SG ====
    const esSg = new ec2.SecurityGroup(this, "EsSg", {
      vpc,
      allowAllOutbound: true,
      description: "Es/Kibana SG",
    });
    esSg.addIngressRule(esSg, ec2.Port.tcp(9300), "ES inter-node");
    esSg.addIngressRule(esSg, ec2.Port.tcp(9200), "ES REST");
    esSg.addIngressRule(esSg, ec2.Port.tcp(5044), "Logstash beats");
    esSg.addIngressRule(esSg, ec2.Port.tcp(5601), "Kibana");
    esSg.addIngressRule(ec2.Peer.ipv4(globalIpCidr), ec2.Port.tcp(22), "SSH");
    esSg.addIngressRule(ec2.Peer.ipv4(globalIpCidr), ec2.Port.tcp(5601), "Kibana");

    // ==== IAM Role ====
    const role = new iam.Role(this, "EsEc2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    // SSM
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
    // EC2 discorvery
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:DescribeInstances"],
        resources: ["*"],
      })
    );
    const profile = new iam.CfnInstanceProfile(this, "EsInstanceProfile", {
      roles: [role.roleName],
    });

    // ==== AMI =====
    const ami = ec2.MachineImage.latestAmazonLinux2({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // ==== UserData ====
    const clusterTagKey = "Cluster";
    const clusterTagVal = "es9-cdk";

    const repoText = fs.readFileSync("lib/config/elasticsearch.repo", "utf8");
    const settingEs = fs.readFileSync("lib/config/elasticsearch.yml", "utf8");
    const settingKibana = fs.readFileSync("lib/config/kibana.yml", "utf8");

    const commonUserData = () => {
      const ud = ec2.UserData.forLinux();
      ud.addCommands(
        "set -eux",
        // ES 9
        "rpm --import https://artifacts.elastic.co/GPG-KEY-elasticsearch",
        "cat << EOT > /etc/yum.repos.d/elasticsearch.repo",
        repoText,
        "EOT",
        "yum install -y logstash",
        "yum install -y elasticsearch | tee elasticsearch.txt",
        "yum install -y kibana",
        "cat << EOT > /etc/elasticsearch/elasticsearch.yml",
        settingEs,
        "EOT",
        "cat << EOT > /etc/kibana/kibana.yml",
        settingKibana,
        "EOT",
        "mkdir -p /etc/elasticsearch/jvm.options.d",
        'echo "-Xms2g" >  /etc/elasticsearch/jvm.options.d/heap.options',
        'echo "-Xmx2g" >> /etc/elasticsearch/jvm.options.d/heap.options',
        "systemctl daemon-reload",
        "systemctl enable logstash",
        "systemctl enable elasticsearch",
        "systemctl enable kibana",
        "systemctl start logstash",
        "systemctl status logstash",
        "systemctl start elasticsearch",
        "systemctl status elasticsearch",
        "systemctl start kibana",
        "systemctl status kibana",
        "curl http://localhost:5601"
      );
      return ud;
    };
    // console.info(commonUserData().render()); // 確認用

    const node1Ud = commonUserData();

    // ==== Instances ====
    const blockDevice: ec2.BlockDevice = {
      deviceName: "/dev/xvda",
      volume: ec2.BlockDeviceVolume.ebs(50, { encrypted: true }),
    };
    const subnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    }).subnets;

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
        keyPair: ec2.KeyPair.fromKeyPairName(this, `KeyPair`, `es-node`),
      });
      cdk.Tags.of(inst).add(clusterTagKey, clusterTagVal);
      cdk.Tags.of(inst).add("Name", `es-node-${index + 1}`);
      (inst.node.defaultChild as ec2.CfnInstance).iamInstanceProfile = profile.ref;

      new cdk.CfnOutput(this, `OutInstanceId${id}`, { value: inst.instanceId });

      return inst;
    };
    // EIP
    const eip1 = new ec2.CfnEIP(this, `Eip${id}`, {
      domain: "vpc",
    });
    new cdk.CfnOutput(this, `OutEip${id}`, {
      value: eip1.eipRef.publicIp,
    });

    const es1 = mkInstance("EsNode1", 0, node1Ud);
    eip1.instanceId = es1.instanceId;
  }
}
