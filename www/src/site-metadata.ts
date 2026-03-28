export interface SiteMetadata {
  readonly packageName: string;
  readonly npmPackageUrl: string;
  readonly githubRepositoryName: string;
  readonly githubRepositoryUrl: string;
}

export const siteMetadata: SiteMetadata = {
  packageName: "litzjs",
  npmPackageUrl: "https://www.npmjs.com/package/litzjs",
  githubRepositoryName: "samlaycock/litzjs",
  githubRepositoryUrl: "https://github.com/samlaycock/litzjs",
};
