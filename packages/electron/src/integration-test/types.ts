export interface SignInOptions {
  email: string;
  password: string;
  url: string;
  clientId: string;
  envPrefix: string;
}

export enum AuthType {
  Redirect,
  PopUp,
}