export const typeDefs = /* GraphQL */ `
  scalar DateTime

  type Project {
    id: ID!
    slugId: String!
    name: String!
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
    priority: Int
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
    issues(filter: IssueFilter, first: Int, after: String): IssueConnection!
    issue(id: ID!): Issue
    nodes(ids: [ID!]!): [Issue]!
  }

  input IssueUpdateInput {
    title: String
    description: String
    stateName: String
    priority: Int
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
    issueUpdate(id: ID!, input: IssueUpdateInput!): IssuePayload!
    commentCreate(issueId: ID!, body: String!): CommentPayload!
    commentUpdate(id: ID!, body: String!): CommentPayload!
  }
`;
