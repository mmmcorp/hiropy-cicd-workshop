import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";

interface ConsumerProps extends StackProps {
  ecrRepository: ecr.Repository;
  testAppFargateService: ecsPatterns.ApplicationLoadBalancedFargateService;
  prodAppFargateService: ecsPatterns.ApplicationLoadBalancedFargateService;
}

export class PipelineCdkStack extends Stack {
  public readonly repository: codecommit.Repository;
  constructor(scope: Construct, id: string, props: ConsumerProps) {
    super(scope, id, props);

    const sourceRepo = new codecommit.Repository(this, "CICD_Workshop", {
      repositoryName: "CICD_Workshop",
      description: "Repository for my application code and infrastructure",
    });
    this.repository = sourceRepo;

    const unitTestProject = new codebuild.PipelineProject(
      this,
      "UnitTestProject",
      {
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
          privileged: true,
          computeType: codebuild.ComputeType.LARGE,
        },
        buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec_test.yml"),
      }
    );

    const pipeline = new codepipeline.Pipeline(this, "CICD_Workshop_Pipeline", {
      pipelineName: "CICD_Workshop_Pipeline",
      crossAccountKeys: false,
    });

    const sourceOutput = new codepipeline.Artifact();
    const unitTestOutput = new codepipeline.Artifact();

    pipeline.addStage({
      stageName: "Source",
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          actionName: "CodeCommit",
          repository: sourceRepo,
          output: sourceOutput,
          branch: "main",
        }),
      ],
    });

    pipeline.addStage({
      stageName: "Code-Quality-Testing",
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: "Unit-Test",
          project: unitTestProject,
          input: sourceOutput,
          outputs: [unitTestOutput],
        }),
      ],
    });
  }
}
