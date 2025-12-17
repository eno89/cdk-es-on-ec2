# ES on EC2

- Elastic Search を EC2 上で構築する。
- このリポジトリは pnpm workspace のモノレポ構成です。CDK アプリ本体は `packages/*` 配下にあります。
  - `multi`での構成は **Elasticsearch 3 台 (EC2×3)** を **Private サブネット** に配置します。Kibana/Logstash は 1 台目のみ起動します。
    - Kibana へのアクセスは Public ALB 経由（`OutKibanaUrl`）です。
    - サンプル用途のため `xpack.security.enabled: false` で起動します（セキュリティ有効化は証明書/CA の配布設計が必要）。

## 初期化

- CDK 関連

```bash
cd packages/multi
npx cdk init app --language=typescript
npx cdk cli-telemetry --disable
npx cdk cdknowledge 34892
```

- キー作成

```bash
ssh-keygen -t rsa -b 4096 -N '' -C 'es-node' -f es-node
```

- ACM 作成

## コマンド

- `pnpm multi:check` コード確認
- `pnpm multi:deploy` デプロイ
  - `packages/multi/cdk.context.json` に `"globalIp": "xx.xx.xx.xx/32"`
  - `pnpm multi:deploy -- -c globalIp=xx.xx.xx.xx/32 -c acmCertArn=arn:aws:acm:ap-northeast-1:xxxxxxxxxxxx:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- `pnpm test` スナップショットテスト（全ワークスペース）
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

# ポートフォワード(SSM)
aws ssm start-session \
 --target=${InstanceId} \
 --document-name AWS-StartPortForwardingSession \
 --parameters '{"portNumber":["5601"],"localPortNumber":["5601"]}'

# EC2停止
aws ec2 stop-instances --instance-ids ${OutInstanceIdEsNode1} ${OutInstanceIdEsNode2} ${OutInstanceIdEsNode3}

# EC2開始
aws ec2 start-instances --instance-ids ${OutInstanceIdEsNode1} ${OutInstanceIdEsNode2} ${OutInstanceIdEsNode3}

# S3 copy
echo ${OutBucekt}
BUCKET=xx-xxx-xxxxxx-xxxx-xxxxxxxxxxxx
cat /etc/elasticsearch/elasticsearch.yml
aws s3 cp /etc/elasticsearch/elasticsearch.yml s3://${BUCKET}/${HOSTNAME}/

cat /etc/kibana/kibana.yml
cat /etc/kibana/kibana.yml.backup
aws s3 cp /etc/kibana/kibana.yml s3://${BUCKET}/${HOSTNAME}/
aws s3 cp /etc/kibana/kibana.yml.backup s3://${BUCKET}/${HOSTNAME}/

aws s3 cp /etc/elasticsearch/elasticsearch.yml s3://${BUCKET}/${HOSTNAME}/

aws s3 ls s3://${BUCKET}/ --recursive
aws s3 cp s3://${BUCKET}/ ./ --recursive
```
