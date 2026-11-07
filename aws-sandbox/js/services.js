/* AWS Architecture Sandbox — service catalog and connection rules.
 *
 * An arrow A → B on the canvas means "A sends requests, data or events to B"
 * (or, for WAF / Shield / ACM, "A is attached to B").
 *
 * Every service has a list of tags. TAG_TO says which tags (or "#serviceId")
 * each tag is allowed to send to. A few pairs are also allowed in the reverse
 * direction (BIDIR), because people draw them both ways (a worker polling a
 * queue, Athena reading S3...).
 */
(function (S) {
  'use strict';

  const CATS = {
    clients:     { name: 'Users & external',          color: '#4b5563' },
    groups:      { name: 'Network boxes (VPC, subnets)', color: '#248814' },
    networking:  { name: 'Networking & content delivery', color: '#8c4fff' },
    compute:     { name: 'Compute',                    color: '#ed7100' },
    containers:  { name: 'Containers',                 color: '#ed7100' },
    storage:     { name: 'Storage',                    color: '#7aa116' },
    database:    { name: 'Databases',                  color: '#c925d1' },
    integration: { name: 'Application integration',    color: '#e7157b' },
    analytics:   { name: 'Analytics',                  color: '#8c4fff' },
    ml:          { name: 'AI & machine learning',      color: '#01a88d' },
    security:    { name: 'Security & identity',        color: '#dd344c' },
    management:  { name: 'Management & governance',    color: '#e7157b' },
    devtools:    { name: 'Developer tools',            color: '#c925d1' },
    frontend:    { name: 'Front-end web & mobile',     color: '#dd344c' },
    iot:         { name: 'Internet of Things',         color: '#7aa116' },
    media:       { name: 'Media services',             color: '#ed7100' },
    migration:   { name: 'Migration & transfer',       color: '#01a88d' },
    business:    { name: 'Business apps & messaging',  color: '#dd344c' },
  };

  // flags:
  //  vpc      lives inside a VPC subnet (must be placed in a subnet box)
  //  pub      can be reached from the internet (subject to config)
  //  global   not tied to a region
  //  ha       'inherent' (AWS runs it across AZs for you) | 'azs' (you choose AZ count)
  //  start    can start a flow on its own (schedules, alarms, uploads...)
  //  group    is a box other services are placed inside
  //  anyIn    any AWS service may send to it (monitoring, keys, secrets...)
  //  place    placement-only: fine without arrows (NAT, IGW, endpoints...)
  const L = [];
  function s(id, name, short, cat, tags, icon, flags, desc) {
    L.push(Object.assign({ id, name, short, cat, tags, icon, desc }, flags || {}));
  }
  const H = { ha: 'inherent' };
  const AZ = { ha: 'azs' };

  // ---------- Users & external ----------
  s('users', 'Users (web browser)', 'Users', 'clients', ['client', 'human'], 'r:Users', { start: 1, global: 1 }, 'People visiting your site or app from a browser, anywhere on the internet.');
  s('mobile', 'Mobile app', 'Mobile app', 'clients', ['client', 'human'], 'r:Mobileclient', { start: 1, global: 1 }, 'An iOS or Android app used by your customers.');
  s('devices', 'IoT devices', 'IoT devices', 'clients', ['client', 'device'], 'r:AWSIoTThingGeneric', { start: 1, global: 1 }, 'Sensors, machines or gadgets sending telemetry.');
  s('onprem', 'On-premises data center', 'Data center', 'clients', ['client', 'onprem'], 'g:Corporatedatacenter', { start: 1, global: 1 }, 'Your existing servers, databases and file shares outside AWS.');
  s('external', 'Third-party API / SaaS', 'External API', 'clients', ['client', 'external'], 'r:Internet', { start: 1, global: 1 }, 'An outside service such as a payment provider, CRM or partner API.');
  s('developer', 'Developers', 'Developers', 'clients', ['client', 'dev'], 'r:User', { start: 1, global: 1 }, 'Your engineering team pushing code and managing the account.');

  // ---------- Network boxes ----------
  s('vpc', 'VPC', 'VPC', 'groups', ['vpcbox'], 'g:VirtualprivatecloudVPC', { group: 1 }, 'Your private network in a region. Draw it as a box and put subnets inside it.');
  s('pubsubnet', 'Public subnet', 'Public subnet', 'groups', ['subnetbox'], 'g:Publicsubnet', { group: 1, subnet: 'public' }, 'A subnet with a route to an Internet Gateway. Load balancers and NAT gateways go here.');
  s('privsubnet', 'Private subnet', 'Private subnet', 'groups', ['subnetbox'], 'g:Privatesubnet', { group: 1, subnet: 'private' }, 'A subnet with no direct internet route. App servers and databases belong here.');

  // ---------- Networking ----------
  s('igw', 'Internet Gateway', 'Internet GW', 'networking', ['netplace', 'igw'], 'r:AmazonVPCInternetGateway', { place: 1, anyIn: 1 }, 'Gives public subnets a route to and from the internet. One per VPC.');
  s('nat', 'NAT Gateway', 'NAT GW', 'networking', ['netplace', 'natgw'], 'r:AmazonVPCNATGateway', { place: 1, anyIn: 1, vpc: 1, fixedSubnet: 'public' }, 'Lets private subnets reach the internet (outbound only). Sits in a public subnet.');
  s('gwendpoint', 'VPC Gateway Endpoint', 'Gateway endpoint', 'networking', ['netplace', 'endpoint-gw'], 'r:AmazonVPCEndpoints', { place: 1, anyIn: 1 }, 'Free private route from your VPC to S3 and DynamoDB, without a NAT gateway.');
  s('ifendpoint', 'VPC Interface Endpoint', 'Interface endpoint', 'networking', ['netplace', 'endpoint-if'], 'r:AmazonVPCEndpoints', { place: 1, anyIn: 1 }, 'PrivateLink endpoint that lets private subnets call AWS services (SQS, SNS, Secrets Manager...) without the internet.');
  s('privatelink', 'PrivateLink service', 'PrivateLink', 'networking', ['netplace'], 's:AWSPrivateLink', { place: 1, anyIn: 1 }, 'Expose a service privately to other VPCs or accounts.');
  s('tgw', 'Transit Gateway', 'Transit GW', 'networking', ['netplace', 'hub'], 's:AWSTransitGateway', { place: 1, anyIn: 1 }, 'Hub that connects many VPCs and on-premises networks.');
  s('peering', 'VPC Peering', 'VPC peering', 'networking', ['netplace', 'hub'], 'r:AmazonVPCPeeringConnection', { place: 1, anyIn: 1 }, 'Private one-to-one link between two VPCs.');
  s('vpn', 'Site-to-Site VPN', 'S2S VPN', 'networking', ['hybridlink'], 's:AWSSitetoSiteVPN', { anyIn: 0 }, 'Encrypted tunnel over the internet between your data center and a VPC.');
  s('dx', 'Direct Connect', 'Direct Connect', 'networking', ['hybridlink'], 's:AWSDirectConnect', {}, 'Dedicated private fiber link from your data center to AWS.');
  s('clientvpn', 'Client VPN', 'Client VPN', 'networking', ['hybridlink'], 's:AWSClientVPN', { pub: 1 }, 'Lets individual employees connect to the VPC from their laptops.');
  s('route53', 'Route 53', 'Route 53', 'networking', ['dns'], 's:AmazonRoute53', { pub: 1, global: 1, start: 0 }, 'DNS: maps your domain name to CloudFront, load balancers or API Gateway. Supports failover and latency routing.');
  s('cloudfront', 'CloudFront', 'CloudFront', 'networking', ['edge'], 's:AmazonCloudFront', { pub: 1, global: 1 }, 'Content delivery network: caches content at 600+ edge locations close to users.');
  s('ga', 'Global Accelerator', 'Global Accel.', 'networking', ['accel'], 's:AWSGlobalAccelerator', { pub: 1, global: 1 }, 'Static anycast IPs that route users over the AWS backbone to the nearest healthy region.');
  s('alb', 'Application Load Balancer', 'ALB', 'networking', ['lb', 'alb'], 'r:ElasticLoadBalancingApplicationLoadBalancer', Object.assign({ vpc: 1, pub: 1 }, AZ), 'HTTP/HTTPS load balancer with path and host routing. Needs subnets in at least 2 AZs.');
  s('nlb', 'Network Load Balancer', 'NLB', 'networking', ['lb'], 'r:ElasticLoadBalancingNetworkLoadBalancer', Object.assign({ vpc: 1, pub: 1 }, AZ), 'TCP/UDP load balancer for very high throughput, static IPs and non-HTTP traffic.');
  s('gwlb', 'Gateway Load Balancer', 'GWLB', 'networking', ['netplace'], 'r:ElasticLoadBalancingGatewayLoadBalancer', { place: 1, anyIn: 1, vpc: 1 }, 'Inserts third-party firewall appliances into the traffic path.');
  s('netfw', 'Network Firewall', 'Network FW', 'networking', ['netplace'], 's:AWSNetworkFirewall', { place: 1, anyIn: 1 }, 'Managed stateful firewall for VPC traffic.');
  s('apigw', 'API Gateway', 'API Gateway', 'networking', ['api', 'apigw'], 's:AmazonAPIGateway', Object.assign({ pub: 1, start: 0 }, H), 'Managed front door for REST, HTTP and WebSocket APIs: auth, throttling, caching.');
  s('cloudmap', 'Cloud Map', 'Cloud Map', 'networking', ['support'], 's:AWSCloudMap', { anyIn: 1, place: 1 }, 'Service discovery: lets services find each other by name.');
  s('lattice', 'VPC Lattice', 'VPC Lattice', 'networking', ['mesh'], 's:AmazonVPCLattice', H, 'Service-to-service networking across VPCs and accounts.');

  // ---------- Compute ----------
  s('ec2', 'EC2 instance', 'EC2', 'compute', ['vm', 'ec2'], 's:AmazonEC2', Object.assign({ vpc: 1, pub: 1 }, AZ), 'A virtual server. You manage the OS, patching and scaling.');
  s('asg', 'EC2 Auto Scaling group', 'Auto Scaling', 'compute', ['vm', 'ec2'], 's:AmazonEC2AutoScaling', Object.assign({ vpc: 1 }, AZ), 'A fleet of EC2 instances that grows and shrinks with load and replaces unhealthy ones.');
  s('lambda', 'Lambda', 'Lambda', 'compute', ['function'], 's:AWSLambda', H, 'Run code without servers. Pay per request; scales automatically.');
  s('lightsail', 'Lightsail', 'Lightsail', 'compute', ['vm', 'web'], 's:AmazonLightsail', { pub: 1 }, 'Simple virtual private server with fixed monthly pricing.');
  s('beanstalk', 'Elastic Beanstalk', 'Beanstalk', 'compute', ['vm', 'web'], 's:AWSElasticBeanstalk', Object.assign({ pub: 1 }, AZ), 'Upload your code; Beanstalk creates the load balancer, scaling group and monitoring.');
  s('batch', 'AWS Batch', 'Batch', 'compute', ['etl', 'batch'], 's:AWSBatch', H, 'Run large batch jobs on managed compute.');
  s('outposts', 'Outposts', 'Outposts', 'compute', ['vm'], 's:AWSOutpostsrack', {}, 'AWS hardware installed in your own data center.');
  s('ec2imagebuilder', 'EC2 Image Builder', 'Image Builder', 'compute', ['support'], 's:AmazonEC2ImageBuilder', { anyIn: 1, place: 1 }, 'Builds and patches machine images automatically.');

  // ---------- Containers ----------
  s('ecs', 'ECS service', 'ECS', 'containers', ['container', 'ecs'], 's:AmazonElasticContainerService', Object.assign({ vpc: 1 }, AZ), 'Run Docker containers. Choose Fargate (serverless) or EC2 capacity.');
  s('eks', 'EKS cluster', 'EKS', 'containers', ['container'], 's:AmazonElasticKubernetesService', Object.assign({ vpc: 1 }, AZ), 'Managed Kubernetes control plane.');
  s('fargate', 'Fargate task', 'Fargate', 'containers', ['container'], 's:AWSFargate', Object.assign({ vpc: 1 }, AZ), 'Serverless compute for containers: no servers or clusters to manage.');
  s('apprunner', 'App Runner', 'App Runner', 'containers', ['container', 'web'], 's:AWSAppRunner', Object.assign({ pub: 1 }, H), 'Deploy a container or source repo as a public HTTPS web service in one step.');
  s('ecr', 'Elastic Container Registry', 'ECR', 'containers', ['support', 'registry'], 's:AmazonElasticContainerRegistry', { anyIn: 1 }, 'Private Docker image registry.');

  // ---------- Storage ----------
  s('s3', 'S3 bucket', 'S3', 'storage', ['object'], 's:AmazonSimpleStorageService', Object.assign({ pub: 1, start: 1 }, H), 'Object storage for files, images, backups and data lakes. 11 nines of durability.');
  s('glacier', 'S3 Glacier', 'S3 Glacier', 'storage', ['archive'], 's:AmazonSimpleStorageServiceGlacier', H, 'Very cheap archive storage classes. Objects move here with S3 lifecycle rules.');
  s('efs', 'EFS file system', 'EFS', 'storage', ['file'], 's:AmazonEFS', Object.assign({ vpc: 1 }, H), 'Shared NFS file system that many servers or containers can mount at once.');
  s('fsx', 'FSx', 'FSx', 'storage', ['file'], 's:AmazonFSx', Object.assign({ vpc: 1 }, AZ), 'Managed Windows File Server, Lustre, NetApp ONTAP or OpenZFS file systems.');
  s('ebs', 'EBS volume', 'EBS', 'storage', ['block'], 's:AmazonElasticBlockStore', {}, 'Block disk attached to one EC2 instance in one AZ.');
  s('backup', 'AWS Backup', 'Backup', 'storage', ['backup'], 's:AWSBackup', { anyIn: 0, start: 1 }, 'Central backup plans for RDS, DynamoDB, EFS, EBS and more, including cross-region copies.');
  s('storagegw', 'Storage Gateway', 'Storage GW', 'storage', ['migrate'], 's:AWSStorageGateway', {}, 'Lets on-premises apps use S3-backed file shares, volumes and tapes.');
  s('elasticdr', 'Elastic Disaster Recovery', 'Elastic DR', 'storage', ['migrate'], 's:AWSElasticDisasterRecovery', {}, 'Continuously replicates servers so you can recover them in AWS within minutes.');

  // ---------- Databases ----------
  s('rds', 'RDS database', 'RDS', 'database', ['sql'], 's:AmazonRDS', Object.assign({ vpc: 1 }, AZ), 'Managed MySQL, PostgreSQL, MariaDB, Oracle or SQL Server. Turn on Multi-AZ for failover.');
  s('aurora', 'Aurora', 'Aurora', 'database', ['sql', 'aurora'], 's:AmazonAurora', Object.assign({ vpc: 1 }, AZ), 'Cloud-native MySQL/PostgreSQL. Storage is always copied 6 ways across 3 AZs; add replicas (up to 15) for fast failover and reads. Global Database, Serverless v2.');
  s('rdsproxy', 'RDS Proxy', 'RDS Proxy', 'database', ['dbproxy'], 'r:AmazonRDSProxyInstance', Object.assign({ vpc: 1 }, H), 'Pools database connections, which protects RDS/Aurora from bursts of Lambda connections.');
  s('dynamodb', 'DynamoDB', 'DynamoDB', 'database', ['nosql', 'kv'], 's:AmazonDynamoDB', Object.assign({ start: 1 }, H), 'Serverless key-value database with single-digit millisecond latency at any scale.');
  s('dax', 'DynamoDB Accelerator (DAX)', 'DAX', 'database', ['cache', 'dax'], 's:AmazonDynamoDB', Object.assign({ vpc: 1 }, AZ), 'In-memory write-through cache in front of DynamoDB (microsecond reads).');
  s('elasticache', 'ElastiCache', 'ElastiCache', 'database', ['cache'], 's:AmazonElastiCache', Object.assign({ vpc: 1 }, AZ), 'Managed Valkey/Redis or Memcached for caching, sessions and leaderboards.');
  s('memorydb', 'MemoryDB', 'MemoryDB', 'database', ['cache', 'durablecache'], 's:AmazonMemoryDB', Object.assign({ vpc: 1 }, AZ), 'Durable in-memory database (Redis-compatible). Can be a primary database.');
  s('documentdb', 'DocumentDB', 'DocumentDB', 'database', ['nosql'], 's:AmazonDocumentDB', Object.assign({ vpc: 1 }, AZ), 'MongoDB-compatible document database.');
  s('neptune', 'Neptune', 'Neptune', 'database', ['nosql', 'graph'], 's:AmazonNeptune', Object.assign({ vpc: 1 }, AZ), 'Graph database for relationships: social networks, fraud rings, knowledge graphs.');
  s('keyspaces', 'Keyspaces', 'Keyspaces', 'database', ['nosql'], 's:AmazonKeyspaces', H, 'Serverless Apache Cassandra-compatible database.');
  s('timestream', 'Timestream', 'Timestream', 'database', ['nosql', 'timeseries'], 's:AmazonTimestream', H, 'Time-series database for IoT and operational metrics.');

  // ---------- Application integration ----------
  s('sqs', 'SQS queue', 'SQS', 'integration', ['queue'], 's:AmazonSimpleQueueService', H, 'Message queue that decouples producers from consumers and absorbs spikes.');
  s('sns', 'SNS topic', 'SNS', 'integration', ['pubsub'], 's:AmazonSimpleNotificationService', H, 'Pub/sub: one message fans out to many subscribers (SQS, Lambda, email, SMS, push).');
  s('eventbridge', 'EventBridge event bus', 'EventBridge', 'integration', ['bus'], 's:AmazonEventBridge', Object.assign({ start: 1 }, H), 'Routes events between your services, AWS services and SaaS apps using rules.');
  s('scheduler', 'EventBridge Scheduler', 'Scheduler', 'integration', ['bus', 'sched'], 'r:AmazonEventBridgeScheduler', Object.assign({ start: 1 }, H), 'Run something on a cron schedule or at a set time, without a server.');
  s('pipes', 'EventBridge Pipes', 'Pipes', 'integration', ['pipes'], 'r:AmazonEventBridgePipes', H, 'Point-to-point connection from a source (queue, stream) to a target, with filtering.');
  s('stepfunctions', 'Step Functions', 'Step Functions', 'integration', ['workflow'], 's:AWSStepFunctions', Object.assign({ start: 1 }, H), 'Visual workflows that orchestrate Lambda, containers and 200+ AWS services with retries.');
  s('mq', 'Amazon MQ', 'Amazon MQ', 'integration', ['queue'], 's:AmazonMQ', Object.assign({ vpc: 1 }, AZ), 'Managed ActiveMQ / RabbitMQ for apps that already speak those protocols.');
  s('appflow', 'AppFlow', 'AppFlow', 'integration', ['etl', 'appflow'], 's:AmazonAppFlow', H, 'No-code data transfer between SaaS apps (Salesforce, Zendesk...) and AWS.');
  s('mwaa', 'Managed Airflow (MWAA)', 'MWAA', 'integration', ['workflow'], 's:AmazonManagedWorkflowsforApacheAirflow', {}, 'Managed Apache Airflow for data pipelines.');

  // ---------- Analytics ----------
  s('kinesis', 'Kinesis Data Streams', 'Kinesis', 'analytics', ['stream'], 's:AmazonKinesisDataStreams', H, 'Real-time data stream with ordering and replay, read by many consumers.');
  s('firehose', 'Data Firehose', 'Firehose', 'analytics', ['delivery'], 's:AmazonDataFirehose', H, 'Loads streaming data into S3, Redshift, OpenSearch or Splunk with no code.');
  s('msk', 'MSK (Managed Kafka)', 'MSK', 'analytics', ['stream'], 's:AmazonManagedStreamingforApacheKafka', Object.assign({ vpc: 1 }, AZ), 'Managed Apache Kafka.');
  s('flink', 'Managed Apache Flink', 'Flink', 'analytics', ['streamproc'], 's:AmazonManagedServiceforApacheFlink', H, 'Real-time stream processing with SQL or Java.');
  s('glue', 'Glue', 'Glue', 'analytics', ['etl', 'catalog'], 's:AWSGlue', Object.assign({ start: 1 }, H), 'Serverless ETL jobs, crawlers and the Data Catalog (table definitions for your data lake).');
  s('athena', 'Athena', 'Athena', 'analytics', ['query'], 's:AmazonAthena', H, 'Query files in S3 with SQL. Serverless, pay per TB scanned.');
  s('redshift', 'Redshift', 'Redshift', 'analytics', ['query', 'warehouse'], 's:AmazonRedshift', Object.assign({ vpc: 1 }, AZ), 'Petabyte-scale data warehouse for BI and complex joins.');
  s('emr', 'EMR', 'EMR', 'analytics', ['etl', 'bigdata'], 's:AmazonEMR', Object.assign({ vpc: 1 }, AZ), 'Managed Spark, Hive and Hadoop clusters.');
  s('opensearch', 'OpenSearch Service', 'OpenSearch', 'analytics', ['search'], 's:AmazonOpenSearchService', Object.assign({}, AZ), 'Full-text search, log analytics and vector search.');
  s('quicksight', 'Quick Sight', 'Quick Sight', 'analytics', ['bi'], 's:AmazonQuickSuite', Object.assign({ pub: 1, start: 1 }, H), 'Business intelligence dashboards for your users and analysts.');
  s('grafana', 'Managed Grafana', 'Grafana', 'analytics', ['bi'], 's:AmazonManagedGrafana', Object.assign({ pub: 1, start: 1 }, H), 'Operational dashboards for metrics, logs and time series.');
  s('lakeformation', 'Lake Formation', 'Lake Formation', 'analytics', ['support'], 's:AWSLakeFormation', { anyIn: 1, place: 1 }, 'Fine-grained permissions for your data lake.');
  s('datazone', 'DataZone', 'DataZone', 'analytics', ['support'], 's:AmazonDataZone', { anyIn: 1, place: 1 }, 'Catalog and share data across teams.');

  // ---------- AI & ML ----------
  s('bedrock', 'Bedrock', 'Bedrock', 'ml', ['ml', 'genai'], 's:AmazonBedrock', H, 'Foundation models (Claude, Nova, Llama...) via API, plus Knowledge Bases, Agents and Guardrails.');
  s('sagemaker', 'SageMaker AI', 'SageMaker', 'ml', ['ml'], 's:AmazonSageMakerAI', H, 'Build, train and host your own machine learning models.');
  s('rekognition', 'Rekognition', 'Rekognition', 'ml', ['ml'], 's:AmazonRekognition', H, 'Image and video analysis: labels, faces, unsafe content.');
  s('comprehend', 'Comprehend', 'Comprehend', 'ml', ['ml'], 's:AmazonComprehend', H, 'Natural language processing: sentiment, entities, PII detection.');
  s('textract', 'Textract', 'Textract', 'ml', ['ml'], 's:AmazonTextract', H, 'Extract text, forms and tables from scanned documents.');
  s('translate', 'Translate', 'Translate', 'ml', ['ml'], 's:AmazonTranslate', H, 'Machine translation between 75 languages.');
  s('polly', 'Polly', 'Polly', 'ml', ['ml'], 's:AmazonPolly', H, 'Turn text into lifelike speech.');
  s('transcribe', 'Transcribe', 'Transcribe', 'ml', ['ml'], 's:AmazonTranscribe', H, 'Speech to text.');
  s('lex', 'Lex', 'Lex', 'ml', ['ml', 'bot'], 's:AmazonLex', H, 'Conversational chat and voice bots.');
  s('personalize', 'Personalize', 'Personalize', 'ml', ['ml'], 's:AmazonPersonalize', H, 'Real-time product and content recommendations.');
  s('kendra', 'Kendra', 'Kendra', 'ml', ['ml', 'search'], 's:AmazonKendra', H, 'Intelligent enterprise search over your documents.');
  s('frauddetector', 'Fraud Detector', 'Fraud Detector', 'ml', ['ml'], 's:AmazonFraudDetector', H, 'Detect online fraud such as fake accounts and payment fraud.');
  s('qbusiness', 'Amazon Q Business', 'Q Business', 'ml', ['ml'], 's:AmazonQ', Object.assign({ pub: 1 }, H), 'Generative AI assistant over your company data.');

  // ---------- Security & identity ----------
  s('iam', 'IAM', 'IAM', 'security', ['support'], 's:AWSIdentityandAccessManagement', { anyIn: 1, place: 1, global: 1 }, 'Users, roles and policies that control who can do what.');
  s('cognito', 'Cognito', 'Cognito', 'security', ['identity'], 's:AmazonCognito', Object.assign({ pub: 1 }, H), 'Sign-up, sign-in and tokens for your app users (user pools), including social logins.');
  s('identitycenter', 'IAM Identity Center', 'Identity Center', 'security', ['support', 'sso'], 's:AWSIAMIdentityCenter', { anyIn: 1, place: 1, global: 1 }, 'Single sign-on for your workforce across many AWS accounts.');
  s('waf', 'WAF', 'WAF', 'security', ['attach', 'waf'], 's:AWSWAF', { global: 1 }, 'Web application firewall: blocks SQL injection, XSS, bots and floods. Attach to CloudFront, ALB, API Gateway, AppSync.');
  s('shield', 'Shield Advanced', 'Shield', 'security', ['attach'], 's:AWSShield', { global: 1 }, 'Enhanced DDoS protection and response team.');
  s('acm', 'Certificate Manager (ACM)', 'ACM', 'security', ['attach', 'cert'], 's:AWSCertificateManager', { global: 1 }, 'Free TLS certificates for HTTPS on CloudFront, load balancers and API Gateway.');
  s('kms', 'KMS', 'KMS', 'security', ['support', 'kms'], 's:AWSKeyManagementService', { anyIn: 1, place: 1 }, 'Encryption keys for data at rest in S3, EBS, RDS, DynamoDB...');
  s('secrets', 'Secrets Manager', 'Secrets Mgr', 'security', ['support', 'secrets'], 's:AWSSecretsManager', { anyIn: 1, place: 1 }, 'Stores and automatically rotates database passwords and API keys.');
  s('guardduty', 'GuardDuty', 'GuardDuty', 'security', ['support', 'finding'], 's:AmazonGuardDuty', { anyIn: 1, place: 1, start: 1 }, 'Threat detection from CloudTrail, VPC flow logs and DNS logs.');
  s('securityhub', 'Security Hub', 'Security Hub', 'security', ['support', 'finding'], 's:AWSSecurityHub', { anyIn: 1, place: 1, start: 1 }, 'One place for security findings and compliance checks across accounts.');
  s('inspector', 'Inspector', 'Inspector', 'security', ['support', 'finding'], 's:AmazonInspector', { anyIn: 1, place: 1, start: 1 }, 'Scans EC2, containers and Lambda for vulnerabilities.');
  s('macie', 'Macie', 'Macie', 'security', ['support', 'finding'], 's:AmazonMacie', { anyIn: 1, place: 1, start: 1 }, 'Finds sensitive data (PII) in S3 buckets.');
  s('detective', 'Detective', 'Detective', 'security', ['support'], 's:AmazonDetective', { anyIn: 1, place: 1 }, 'Investigates the root cause of security findings.');
  s('firewallmanager', 'Firewall Manager', 'Firewall Mgr', 'security', ['support'], 's:AWSFirewallManager', { anyIn: 1, place: 1 }, 'Central WAF and firewall rules across accounts.');
  s('directory', 'Directory Service', 'Directory', 'security', ['support'], 's:AWSDirectoryService', { anyIn: 1, place: 1 }, 'Managed Microsoft Active Directory.');
  s('verifiedpermissions', 'Verified Permissions', 'Verified Perms', 'security', ['support'], 's:AmazonVerifiedPermissions', { anyIn: 1, place: 1 }, 'Fine-grained authorization for your own app (Cedar policies).');

  // ---------- Management & governance ----------
  s('cloudwatch', 'CloudWatch', 'CloudWatch', 'management', ['support', 'alarm', 'monitor'], 's:AmazonCloudWatch', { anyIn: 1, place: 1, start: 1 }, 'Metrics, logs, dashboards and alarms for everything you run.');
  s('xray', 'X-Ray', 'X-Ray', 'management', ['support', 'monitor'], 's:AWSXRay', { anyIn: 1, place: 1 }, 'Distributed tracing to find slow or failing calls between services.');
  s('cloudtrail', 'CloudTrail', 'CloudTrail', 'management', ['support', 'trail'], 's:AWSCloudTrail', { anyIn: 1, place: 1, start: 1, global: 1 }, 'Records every API call in your accounts for audit.');
  s('config', 'AWS Config', 'Config', 'management', ['support', 'finding'], 's:AWSConfig', { anyIn: 1, place: 1, start: 1 }, 'Tracks resource configuration changes and checks compliance rules.');
  s('ssm', 'Systems Manager', 'Systems Mgr', 'management', ['support', 'ssm'], 's:AWSSystemsManager', { anyIn: 1, place: 1, start: 1 }, 'Patch, run commands and log in to servers without SSH. Includes Parameter Store.');
  s('organizations', 'Organizations', 'Organizations', 'management', ['support', 'org'], 's:AWSOrganizations', { anyIn: 1, place: 1, global: 1 }, 'Group accounts, consolidate billing and apply service control policies (SCPs).');
  s('controltower', 'Control Tower', 'Control Tower', 'management', ['support', 'org'], 's:AWSControlTower', { anyIn: 1, place: 1, global: 1 }, 'Sets up a governed multi-account landing zone with guardrails.');
  s('cloudformation', 'CloudFormation', 'CloudFormation', 'management', ['iac'], 's:AWSCloudFormation', { start: 1 }, 'Infrastructure as code: create whole environments from templates.');
  s('servicecatalog', 'Service Catalog', 'Service Catalog', 'management', ['support'], 's:AWSServiceCatalog', { anyIn: 1, place: 1 }, 'Approved product templates teams can launch themselves.');
  s('trustedadvisor', 'Trusted Advisor', 'Trusted Advisor', 'management', ['support'], 's:AWSTrustedAdvisor', { anyIn: 1, place: 1, global: 1 }, 'Checks for cost savings, security gaps and limits.');
  s('budgets', 'Budgets', 'Budgets', 'management', ['support', 'alarm'], 's:AWSBudgets', { anyIn: 1, place: 1, start: 1, global: 1 }, 'Alerts when spend goes over a threshold.');
  s('costexplorer', 'Cost Explorer', 'Cost Explorer', 'management', ['support'], 's:AWSCostExplorer', { anyIn: 1, place: 1, global: 1 }, 'Analyze and forecast your AWS spend.');
  s('prometheus', 'Managed Prometheus', 'Prometheus', 'management', ['support', 'monitor'], 's:AmazonManagedServiceforPrometheus', { anyIn: 1, place: 1 }, 'Prometheus-compatible metrics for containers.');
  s('resiliencehub', 'Resilience Hub', 'Resilience Hub', 'management', ['support'], 's:AWSResilienceHub', { anyIn: 1, place: 1 }, 'Checks whether your app meets its RTO and RPO targets.');
  s('arc', 'Application Recovery Controller', 'Recovery Ctrl', 'management', ['support', 'arc'], 's:AmazonApplicationRecoveryController', { anyIn: 1, place: 1, global: 1 }, 'Readiness checks and routing controls for multi-region failover.');

  // ---------- Developer tools ----------
  s('codepipeline', 'CodePipeline', 'CodePipeline', 'devtools', ['cicd'], 's:AWSCodePipeline', { start: 1 }, 'Release pipeline: source → build → test → deploy.');
  s('codebuild', 'CodeBuild', 'CodeBuild', 'devtools', ['cicd'], 's:AWSCodeBuild', {}, 'Managed build and test runners.');
  s('codedeploy', 'CodeDeploy', 'CodeDeploy', 'devtools', ['cicd'], 's:AWSCodeDeploy', {}, 'Rolling, blue/green and canary deployments to EC2, ECS and Lambda.');
  s('codecommit', 'CodeCommit', 'CodeCommit', 'devtools', ['cicd'], 's:AWSCodeCommit', {}, 'Private Git repositories.');
  s('codeartifact', 'CodeArtifact', 'CodeArtifact', 'devtools', ['support'], 's:AWSCodeArtifact', { anyIn: 1, place: 1 }, 'Private package repository (npm, pip, Maven).');
  s('cdk', 'Cloud Development Kit', 'CDK', 'devtools', ['iac'], 's:AWSCloudDevelopmentKit', {}, 'Define infrastructure in TypeScript, Python, Java... (deploys via CloudFormation).');

  // ---------- Front-end web & mobile ----------
  s('amplify', 'Amplify Hosting', 'Amplify', 'frontend', ['web', 'webhost'], 's:AWSAmplify', Object.assign({ pub: 1 }, H), 'Git-based hosting for single-page and server-rendered web apps, with CI/CD built in.');
  s('appsync', 'AppSync', 'AppSync', 'frontend', ['api', 'graphql'], 's:AWSAppSync', Object.assign({ pub: 1 }, H), 'Managed GraphQL and real-time (subscriptions) APIs.');
  s('location', 'Location Service', 'Location', 'frontend', ['ml'], 's:AmazonLocationService', H, 'Maps, geocoding, routing and geofences.');
  s('devicefarm', 'Device Farm', 'Device Farm', 'frontend', ['support'], 's:AWSDeviceFarm', { anyIn: 1, place: 1 }, 'Test apps on real phones and browsers.');

  // ---------- IoT ----------
  s('iotcore', 'IoT Core', 'IoT Core', 'iot', ['iotcore'], 's:AWSIoTCore', Object.assign({ start: 1 }, H), 'Secure MQTT broker for millions of devices, with rules that route messages to AWS services.');
  s('greengrass', 'IoT Greengrass', 'Greengrass', 'iot', ['edgecompute'], 's:AWSIoTGreengrass', {}, 'Run Lambda functions and ML on devices at the edge, even offline.');
  s('sitewise', 'IoT SiteWise', 'SiteWise', 'iot', ['iotdata'], 's:AWSIoTSiteWise', H, 'Collect and model industrial equipment data.');
  s('iotdevicedefender', 'IoT Device Defender', 'Device Defender', 'iot', ['support'], 's:AWSIoTDeviceDefender', { anyIn: 1, place: 1 }, 'Audits device security settings.');
  s('kvs', 'Kinesis Video Streams', 'Video Streams', 'iot', ['videoingest'], 's:AmazonKinesisVideoStreams', H, 'Ingest live video from cameras for playback and analysis.');

  // ---------- Media ----------
  s('mediaconvert', 'Elemental MediaConvert', 'MediaConvert', 'media', ['mediajob'], 's:AWSElementalMediaConvert', H, 'Transcode video files into streaming formats (HLS, DASH) and sizes.');
  s('medialive', 'Elemental MediaLive', 'MediaLive', 'media', ['medialive'], 's:AWSElementalMediaLive', {}, 'Live video encoding for broadcast-grade streams.');
  s('mediapackage', 'Elemental MediaPackage', 'MediaPackage', 'media', ['mediapkg'], 's:AWSElementalMediaPackage', H, 'Packages and protects live and on-demand video for delivery.');
  s('ivs', 'Interactive Video Service', 'IVS', 'media', ['ivs'], 's:AmazonInteractiveVideoService', Object.assign({ pub: 1 }, H), 'Low-latency live streaming in a few lines of code.');

  // ---------- Migration ----------
  s('dms', 'Database Migration Service', 'DMS', 'migration', ['migrate', 'dms'], 's:AWSDatabaseMigrationService', {}, 'Migrate and continuously replicate databases into AWS with minimal downtime.');
  s('datasync', 'DataSync', 'DataSync', 'migration', ['migrate'], 's:AWSDataSync', {}, 'Fast online transfer of files from NFS/SMB to S3, EFS or FSx.');
  s('snowball', 'Snowball Edge', 'Snowball', 'migration', ['migrate'], 's:AWSSnowballEdge', {}, 'Ship a rugged storage device to move hundreds of terabytes offline.');
  s('mgn', 'Application Migration Service', 'MGN', 'migration', ['migrate', 'mgn'], 's:AWSApplicationMigrationService', {}, 'Lift-and-shift servers to EC2 with continuous block replication.');
  s('transfer', 'Transfer Family', 'Transfer Family', 'migration', ['transfer'], 's:AWSTransferFamily', Object.assign({ pub: 1 }, H), 'Managed SFTP/FTPS/AS2 endpoints that store files in S3 or EFS.');
  s('migrationhub', 'Migration Hub', 'Migration Hub', 'migration', ['support'], 's:AWSMigrationHub', { anyIn: 1, place: 1 }, 'Track migration progress across tools.');

  // ---------- Business apps & messaging ----------
  s('ses', 'Simple Email Service', 'SES', 'business', ['email'], 's:AmazonSimpleEmailService', H, 'Send transactional and marketing email; receive email into S3 or Lambda.');
  s('pinpoint', 'End User Messaging', 'User Messaging', 'business', ['notify'], 's:AWSEndUserMessaging', H, 'SMS, voice and mobile push messages to your users.');
  s('connect', 'Amazon Connect', 'Connect', 'business', ['contact'], 's:AmazonConnect', Object.assign({ pub: 1 }, H), 'Cloud contact center: phone, chat and AI agents.');
  s('workspaces', 'WorkSpaces', 'WorkSpaces', 'business', ['desktop'], 's:AmazonWorkSpaces', { pub: 1 }, 'Virtual desktops for employees.');
  s('workmail', 'WorkMail', 'WorkMail', 'business', ['email'], 's:AmazonWorkMail', Object.assign({ pub: 1 }, H), 'Managed business email and calendars.');

  // ---------------- connection rules ----------------
  const DATA = ['object', 'file', 'sql', 'nosql', 'cache', 'search', 'query', 'dbproxy'];
  const MSG = ['queue', 'pubsub', 'bus', 'stream', 'delivery', 'workflow', 'pipes'];
  const COMPUTE = ['vm', 'container', 'function'];
  const APP = [...DATA, ...MSG, ...COMPUTE, 'ml', 'email', 'notify', 'api', 'lb', 'mesh', 'external', 'identity',
    'etl', 'mediajob', 'iotcore', 'videoingest', 'iotdata', 'block', 'netplace', 'transfer'];

  const TAG_TO = {
    dns: ['edge', 'accel', 'lb', 'api', 'web', '#s3', 'ec2', '#ifendpoint', '#ivs', '#transfer', '#cognito'],
    edge: ['object', 'lb', 'api', 'ec2', 'web', 'function', 'mediapkg', 'search', 'ivs'],
    accel: ['lb', 'ec2'],
    lb: ['vm', 'container', 'function', 'lb', 'identity', 'mesh'],
    api: ['function', 'lb', 'container', 'vm', 'queue', 'pubsub', 'bus', 'stream', 'delivery', 'workflow', 'kv',
      'object', 'external', 'identity', 'mesh', 'netplace'],
    graphql: ['sql', 'search', 'genai', 'nosql'],
    vm: APP, container: APP, function: APP, web: APP, desktop: ['vm', 'container', 'sql', 'file', 'lb', 'object', 'api'],
    object: ['function', 'queue', 'pubsub', 'bus', 'object', 'archive'],
    sql: ['sql', 'object'],
    aurora: ['function', 'ml'],
    dbproxy: ['sql'],
    nosql: ['function', 'stream', 'nosql', 'object', 'pipes', 'search'],
    dax: ['#dynamodb'],
    queue: ['function', 'pipes', 'queue'],
    pubsub: ['queue', 'function', 'delivery', 'external', 'human'],
    bus: ['function', 'queue', 'pubsub', 'workflow', 'stream', 'delivery', 'api', 'container', 'bus', 'external', 'batch', 'pipes'],
    pipes: ['function', 'queue', 'pubsub', 'workflow', 'stream', 'delivery', 'api', 'bus', 'container', 'batch'],
    stream: ['function', 'delivery', 'streamproc', 'pipes'],
    delivery: ['object', 'warehouse', 'search', 'function', 'external'],
    streamproc: ['object', 'stream', 'delivery', 'nosql', 'search', 'sql'],
    etl: ['object', 'sql', 'nosql', 'query', 'search', 'external', 'stream', 'catalog', 'file'],
    query: ['object', 'catalog', 'sql', 'nosql'],
    bi: ['query', 'sql', 'object', 'search', 'nosql', 'monitor'],
    ml: ['object', 'search', 'sql', 'function', 'nosql'],
    attach: ['edge', 'lb', 'api', 'identity', 'accel'],
    identity: ['function', 'email', 'notify', 'pubsub'],
    alarm: ['pubsub', 'function', 'bus', 'vm', 'container'],
    trail: ['object', 'monitor'],
    finding: ['bus', 'pubsub', 'support'],
    ssm: ['vm'],
    backup: ['object', 'file', 'sql', 'nosql', 'block', 'vm', 'archive'],
    iac: ['*aws'],
    cicd: ['*aws', 'external'],
    workflow: ['*aws', 'external'],
    iotcore: ['function', 'nosql', 'stream', 'delivery', 'object', 'pubsub', 'queue', 'bus', 'iotdata', 'workflow', 'search', 'devices'],
    edgecompute: ['iotcore', 'iotdata', 'object', 'stream', 'videoingest'],
    videoingest: ['ml', 'function', 'object'],
    mediajob: ['object', 'bus', 'pubsub'],
    medialive: ['mediapkg', 'object'],
    ivs: ['object', 'bus'],
    migrate: [],
    dms: ['sql', 'nosql', 'object', 'query', 'stream', 'search', 'delivery'],
    mgn: ['vm'],
    transfer: ['object', 'file', 'function', 'workflow'],
    email: ['pubsub', 'object', 'function', 'bus', 'human'],
    notify: ['delivery', 'stream', 'bus', 'human'],
    contact: ['function', 'ml', 'stream', 'object', 'delivery', 'human'],
    hybridlink: ['vm', 'container', 'lb', 'sql', 'file', 'cache', 'hub', 'vpcbox', 'netplace', 'object', 'query', 'search'],
    netplace: ['*aws', 'external', 'onprem'],
    mesh: ['vm', 'container', 'function', 'lb'],
    bot: ['function'],
    genai: ['search', 'sql', 'object', 'function'],
    catalog: [],
  };
  const ID_TO = {
    datasync: ['object', 'file'],
    snowball: ['object'],
    storagegw: ['object', 'file', 'archive'],
    elasticdr: ['vm'],
    appflow: ['external', 'object', 'warehouse'],
    glue: ['catalog'],
    route53: [],
  };

  // pairs that are fine in either direction
  const BIDIR = [
    ['queue', 'vm'], ['queue', 'container'], ['stream', 'vm'], ['stream', 'container'],
    ['query', 'object'], ['etl', 'object'], ['etl', 'sql'], ['etl', 'nosql'], ['etl', 'warehouse'], ['etl', 'catalog'],
    ['bi', 'query'], ['bi', 'sql'], ['bi', 'object'], ['bi', 'search'], ['bi', 'nosql'], ['bi', 'monitor'],
    ['ml', 'object'], ['ml', 'search'], ['attach', 'edge'], ['attach', 'lb'], ['attach', 'api'], ['attach', 'identity'], ['attach', 'accel'],
    ['identity', 'api'], ['identity', 'lb'], ['identity', 'web'], ['backup', 'object'], ['backup', 'file'], ['backup', 'sql'],
    ['backup', 'nosql'], ['backup', 'block'], ['backup', 'vm'], ['catalog', 'query'], ['dbproxy', 'function'],
    ['iotcore', 'devices'], ['hub', 'vpcbox'], ['hub', 'hybridlink'], ['delivery', 'warehouse'], ['genai', 'search'],
  ];

  const SERVICES = {};
  L.forEach((sv) => { SERVICES[sv.id] = sv; });

  S.CATS = CATS;
  S.SERVICES = SERVICES;
  S.SERVICE_LIST = L;
  S.TAG_TO = TAG_TO;
  S.ID_TO = ID_TO;
  S.BIDIR = BIDIR;
})(typeof window !== 'undefined' ? (window.AWSSIM = window.AWSSIM || {}) : (globalThis.AWSSIM = globalThis.AWSSIM || {}));
