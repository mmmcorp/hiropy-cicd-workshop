import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';

interface ConsumerProps extends StackProps {
  ecrRepository: ecr.Repository;
  testAppFargateService: ecsPatterns.ApplicationLoadBalancedFargateService;
  prodAppFargateService: ecsPatterns.ApplicationLoadBalancedFargateService;
}

export class ProdPipelineCdkStack extends Stack {

  constructor(scope: Construct, id: string, props: ConsumerProps) {
    super(scope, id, props);

    const sourceRepo = new codecommit.Repository(this, "CICD_Workshop", {
      repositoryName: "CICD_Workshop",
      description: "Repository for my application code and infrastructure",
    });

    const unitTestProject = new codebuild.PipelineProject(this, 'UnitTestProject', {
      environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      privileged: true,
      computeType: codebuild.ComputeType.LARGE
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec_test.yml')
    });


  const dockerBuildProject = new codebuild.PipelineProject(this, 'DockerBuildProject', {
      environmentVariables: {
        'IMAGE_TAG': { value: 'latest' },
        'IMAGE_REPO_URI': {value: props.ecrRepository.repositoryUri },
        'AWS_ACCOUNT_ID': {value: process.env.CDK_DEFAULT_ACCOUNT },
        'AWS_DEFAULT_REGION': {value: process.env.CDK_DEFAULT_REGION },
      },
      environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      privileged: true,
      computeType: codebuild.ComputeType.LARGE
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec_docker.yml'),
    });

    const dockerBuildRolePolicy =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ]
    });
    dockerBuildProject.addToRolePolicy(dockerBuildRolePolicy);

    const pipeline = new codepipeline.Pipeline(this, 'CICD_Workshop_Pipeline', {
      pipelineName: 'CICD_Workshop_Pipeline',
      crossAccountKeys: false,
    });

    const sourceOutput = new codepipeline.Artifact();
    const unitTestOutput = new codepipeline.Artifact();
    const dockerBuildOutput = new codepipeline.Artifact();

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: 'CodeCommit',
          repository: sourceRepo,
          output: sourceOutput,
          branch: "main",
        }),
      ],
    });

    pipeline.addStage({
      stageName: 'Code-Quality-Testing',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Unit-Test',
          project: unitTestProject,
          input: sourceOutput,
          outputs: [unitTestOutput],
        }),
      ],
    });

    pipeline.addStage({
      stageName: 'ECS',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'docker-step',
          project: dockerBuildProject,
          input: sourceOutput,
          outputs: [dockerBuildOutput],
        }),
      ],
    });

    pipeline.addStage({
      stageName: 'Deploy-Test',
      actions: [
        new codepipeline_actions.EcsDeployAction({
          actionName: 'deployECS',
          service: props.testAppFargateService.service,
          input: dockerBuildOutput
        }),
      ]
    });   

    pipeline.addStage({
      stageName: 'Deploy-Production',
      actions: [
        new codepipeline_actions.ManualApprovalAction({
          actionName: 'Approve-Prod-Deploy',
          runOrder: 1
        }),
        new codepipeline_actions.EcsDeployAction({
          actionName: 'deployECS',
          service: props.prodAppFargateService.service,
          input: dockerBuildOutput,
          runOrder: 2
        })
      ]
    });

    new CfnOutput(this, 'CodeCommitRepositoryUrl', { value: sourceRepo.repositoryCloneUrlHttp });
  }
}
