export interface SignInOptions {
  email: string;
  password: string;
  envPrefix: string;
}

export enum AuthType {
  Redirect,
  PopUp,
}