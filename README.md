# ES on EC2

## 初期化

- CDK 関連

```bash
npx cdk init app --language=typescript
npx cdk cli-telemetry --disable
npx cdk cdknowledge 34892
```

- キー作成

```bash
ssh-keygen -t rsa -b 4096 -N '' -C 'es-node' -f es-node
```

## コマンド

- `npm run check` コード確認
- `npm run deploy` デプロイ
  - `cdk.context.json`に`"globalIp": "xx.xx.xx.xx/32"`
  - `npm run deploy -c globalIp=xx.xx.xx.xx/32`
- `npm run test` スナップショットテスト
- `rain ls EsOnEc2Stack` Output 確認
- `rain rm EsOnEc2Stack` スタック削除

## EC2 操作

```bash
InstanceId="i-xxxxxxxxxxxxxxxxx"
PublicIp="yy.yy.yy.yy"

# SSM経由
aws ssm start-session \
 --target=${InstanceId}

# SSH経由
ssh -i ~/.ssh/es-node ec2-user@${PublicIp}

# EC2上
sudo -i
systemctl status elasticsearch
systemctl status kibana
systemctl status logstash

/usr/share/elasticsearch/bin/elasticsearch-create-enrollment-token -s kibana
/usr/share/kibana/bin/kibana-verification-code
```
