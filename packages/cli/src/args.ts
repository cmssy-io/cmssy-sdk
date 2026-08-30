import { CliError } from "./admin-client";

export function flagValue(args: string[], name: string): string | undefined {
  const index = args.findIndex((arg) => arg === name);
  if (index !== -1) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliError(
        `${name} needs a value`,
        `pass ${name} <value>, or ${name}=<value>`,
      );
    }
    return value;
  }
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}
