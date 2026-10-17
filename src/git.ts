import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly stderr: string,
    cause?: unknown,
  ) {
    super(`Command failed: ${command}\n${stderr}`.trim(), { cause });
    this.name = "CommandError";
  }
}

export async function run(command: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 256 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    // The git-cliff npm wrapper appends a long stack trace after the real message.
    const stderr = ((error as { stderr?: string }).stderr ?? String(error)).split(/\nfile:\/\//)[0] ?? "";
    throw new CommandError(`${command} ${args.join(" ")}`, stderr, error);
  }
}

export interface RawCommit {
  sha: string;
  message: string;
}

export class Git {
  constructor(readonly cwd: string) {}

  private git(...args: string[]): Promise<string> {
    return run("git", args, this.cwd);
  }

  async isShallow(): Promise<boolean> {
    return (await this.git("rev-parse", "--is-shallow-repository")).trim() === "true";
  }

  async head(): Promise<string> {
    return (await this.git("rev-parse", "HEAD")).trim();
  }

  async tagsMergedIntoHead(): Promise<string[]> {
    const out = await this.git("tag", "--merged", "HEAD");
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  }

  async isAncestorOfHead(sha: string): Promise<boolean> {
    try {
      await this.git("merge-base", "--is-ancestor", sha, "HEAD");
      return true;
    } catch (error) {
      // Exit code 1 (not an ancestor) and 128 (commit unknown locally) both mean "not part of HEAD".
      if (error instanceof CommandError) return false;
      throw error;
    }
  }

  async hasTag(tag: string): Promise<boolean> {
    try {
      await this.git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`);
      return true;
    } catch {
      return false;
    }
  }

  async createLightweightTag(tag: string, sha: string): Promise<void> {
    await this.git("tag", tag, sha);
  }

  /** Commits in `range` (or the whole history) touching `pathspecs`, newest first, merges excluded. */
  async log(range: string | undefined, pathspecs: string[]): Promise<RawCommit[]> {
    const args = ["log", "--no-merges", "--format=%x1e%H%x1f%B"];
    args.push(range ?? "HEAD");
    if (pathspecs.length > 0) args.push("--", ...pathspecs);
    const out = await this.git(...args);
    return out
      .split("\x1e")
      .filter((chunk) => chunk.trim() !== "")
      .map((chunk) => {
        const [sha = "", ...message] = chunk.split("\x1f");
        return { sha: sha.trim(), message: message.join("\x1f") };
      });
  }
}
