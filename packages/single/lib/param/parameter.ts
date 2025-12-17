import type { Environment } from "aws-cdk-lib";

export interface AppParam {
  env: Environment;
  projectName: string;
  envName: string;
  taskName: string;
  getPrefixKebab: () => string;
  getPrefixPascal: () => string;
}

export const devParam: AppParam = {
  env: {
    account: '',
    region: 'ap-northeast-1',
  },
  projectName: 'es',
  envName: 'dev',
  taskName: 'single',
  getPrefixKebab: function(){
    return [this.projectName, this.envName, this.taskName ].join('-');
  },
  getPrefixPascal: function(){
    return [ this.projectName, this.envName, this.taskName ]
     .map( (word) => word[0].toUpperCase() + word.slice(1).toLocaleLowerCase())
     .join('');
  },
}
