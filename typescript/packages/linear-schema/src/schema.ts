export const typeDefs = /* GraphQL */ `
  scalar DateTime

  type ProjectWorkspace {
    kind: String!
    localPath: String
    remoteUrl: String
    baseBranch: String
  }

  type Project {
    id: ID!
    slugId: String!
    name: String!
    workspace: ProjectWorkspace!
  }

  type WorkflowState {
    id: ID!
    name: String!
    type: String!
  }

  type Issue {
    id: ID!
    identifier: String!
    title: String!
    description: String
    priority: String
    state: WorkflowState!
    project: Project!
    branchName: String
    url: String
    labels: IssueLabelConnection!
    relations: IssueRelationConnection!
    comments: CommentConnection!
    createdAt: DateTime
    updatedAt: DateTime
  }

  type IssueLabel {
    id: ID!
    name: String!
  }

  type IssueRelation {
    id: ID!
    type: String!
    issue: Issue!
    relatedIssue: Issue!
  }

  type Comment {
    id: ID!
    body: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type IssueConnection {
    nodes: [Issue!]!
    pageInfo: PageInfo!
  }

  type IssueLabelConnection {
    nodes: [IssueLabel!]!
  }

  type IssueRelationConnection {
    nodes: [IssueRelation!]!
  }

  type CommentConnection {
    nodes: [Comment!]!
  }

  input StringComparator {
    eq: String
    in: [String!]
  }

  input ProjectFilter {
    slugId: StringComparator
  }

  input StateFilter {
    name: StringComparator
  }

  input IssueFilter {
    project: ProjectFilter
    state: StateFilter
  }

  type Query {
    projects: [Project!]!
    project(slugId: String!): Project
    issues(filter: IssueFilter, first: Int, after: String): IssueConnection!
    issue(id: ID!): Issue
    nodes(ids: [ID!]!): [Issue]!
  }

  input ProjectWorkspaceInput {
    kind: String!
    localPath: String
    remoteUrl: String
    baseBranch: String
  }

  input ProjectCreateInput {
    slugId: String!
    name: String!
    workspace: ProjectWorkspaceInput!
  }

  input ProjectUpdateInput {
    name: String
    workspace: ProjectWorkspaceInput
  }

  type ProjectPayload {
    success: Boolean!
    project: Project
  }

  type ProjectDeletePayload {
    success: Boolean!
  }

  input IssueCreateInput {
    title: String!
    description: String
    priority: String
    stateName: String!
    projectSlug: String!
    branchName: String
    labels: [String!]
  }

  input IssueUpdateInput {
    title: String
    description: String
    stateName: String
    priority: String
    branchName: String
    url: String
    labels: [String!]
  }

  type IssuePayload {
    success: Boolean!
    issue: Issue
  }

  type CommentPayload {
    success: Boolean!
    comment: Comment
  }

  type Mutation {
    projectCreate(input: ProjectCreateInput!): ProjectPayload!
    projectUpdate(slugId: String!, input: ProjectUpdateInput!): ProjectPayload!
    projectDelete(slugId: String!): ProjectDeletePayload!
    issueCreate(input: IssueCreateInput!): IssuePayload!
    issueUpdate(id: ID!, input: IssueUpdateInput!): IssuePayload!
    commentCreate(issueId: ID!, body: String!): CommentPayload!
    commentUpdate(id: ID!, body: String!): CommentPayload!
  }
`;
