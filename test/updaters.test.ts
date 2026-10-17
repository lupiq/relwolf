import { describe, expect, it } from "vitest";
import { applyUpdater, UpdaterError } from "../src/updaters/index.js";

describe("package-json updater", () => {
  it("updates the version and preserves indentation and trailing newline", () => {
    const input = '{\n    "name": "x",\n    "version": "1.0.0",\n    "dependencies": { "y": "1.0.0" }\n}\n';
    const output = applyUpdater("package-json", input, "1.1.0", "package.json");
    expect(JSON.parse(output)).toEqual({ name: "x", version: "1.1.0", dependencies: { y: "1.0.0" } });
    expect(output.startsWith('{\n    "name"')).toBe(true);
    expect(output.endsWith("}\n")).toBe(true);
  });

  it("does not add a trailing newline when there was none", () => {
    expect(applyUpdater("package-json", '{"version":"1.0.0"}', "2.0.0", "p.json")).toBe('{\n  "version": "2.0.0"\n}');
  });

  it("fails on invalid json or missing version", () => {
    expect(() => applyUpdater("package-json", "{", "1.0.0", "p.json")).toThrow(UpdaterError);
    expect(() => applyUpdater("package-json", '{"name":"x"}', "1.0.0", "p.json")).toThrow(/version/);
    expect(() => applyUpdater("package-json", "[]", "1.0.0", "p.json")).toThrow(/version/);
  });
});

describe("pom-xml updater", () => {
  const pom = (projectVersion: string) => `<?xml version="1.0"?>
<!-- <version>9.9.9</version> -->
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.example</groupId>
    <artifactId>parent</artifactId>
    <version>5.0.0</version>
  </parent>
  <groupId>org.example</groupId>
  <artifactId>app</artifactId>
  <version>${projectVersion}</version>
  <dependencies>
    <dependency>
      <groupId>a</groupId>
      <artifactId>b</artifactId>
      <version>2.0.0</version>
    </dependency>
  </dependencies>
</project>
`;

  it("only changes the project version", () => {
    expect(applyUpdater("pom-xml", pom("1.0.0-SNAPSHOT"), "1.1.0", "pom.xml")).toBe(pom("1.1.0"));
  });

  it("handles self-closing elements and attributes", () => {
    const input = '<project a="b>c"><x/><version>1.0.0</version></project>';
    expect(applyUpdater("pom-xml", input, "2.0.0", "pom.xml")).toBe('<project a="b>c"><x/><version>2.0.0</version></project>');
  });

  it("fails when the project has no own version", () => {
    const input = "<project><parent><version>1</version></parent></project>";
    expect(() => applyUpdater("pom-xml", input, "1.0.0", "pom.xml")).toThrow(UpdaterError);
  });
});

describe("gradle updater", () => {
  it.each([
    ["version = '1.0.0'", "version = '2.0.0'"],
    ['version = "1.0.0"', 'version = "2.0.0"'],
    ['version "1.0.0"', 'version "2.0.0"'],
    ["version='1.0.0-SNAPSHOT'", "version='2.0.0'"],
  ])("updates %s", (input, expected) => {
    const content = `plugins { id 'java' }\n${input}\ndependencies { implementation 'x:y:1.0.0' }\n`;
    expect(applyUpdater("gradle", content, "2.0.0", "build.gradle")).toBe(
      `plugins { id 'java' }\n${expected}\ndependencies { implementation 'x:y:1.0.0' }\n`,
    );
  });

  it("ignores indented (non top-level) version lines", () => {
    expect(() => applyUpdater("gradle", "tasks {\n  version = '1.0.0'\n}", "2.0.0", "build.gradle")).toThrow(UpdaterError);
  });

  it("supports gradle.properties", () => {
    expect(applyUpdater("gradle", "org.gradle.jvmargs=-Xmx1g\nversion=1.0.0\n", "2.0.0", "gradle.properties")).toBe(
      "org.gradle.jvmargs=-Xmx1g\nversion=2.0.0\n",
    );
  });

  it("fails without a version", () => {
    expect(() => applyUpdater("gradle", "plugins {}", "1.0.0", "build.gradle.kts")).toThrow(/version/);
  });
});

describe("generic updater", () => {
  it("replaces the version on marked lines only", () => {
    const input = [
      "image: foo:1.0.0",
      "version: 1.0.0 # x-relwolf-version",
      "// x-relwolf-version",
      "const VERSION = 'v1.0.0'; // x-relwolf-version",
      "dep: 3.0.0",
    ].join("\n");
    // the pure comment line has no version and must fail, so test it separately
    expect(() => applyUpdater("generic", input, "1.1.0", "f")).toThrow(/contains no version/);
    const ok = input.split("\n").filter((l) => l !== "// x-relwolf-version").join("\n");
    expect(applyUpdater("generic", ok, "1.1.0-beta.1", "f")).toBe(
      [
        "image: foo:1.0.0",
        "version: 1.1.0-beta.1 # x-relwolf-version",
        "const VERSION = 'v1.1.0-beta.1'; // x-relwolf-version",
        "dep: 3.0.0",
      ].join("\n"),
    );
  });

  it("replaces a pre-release version completely", () => {
    expect(applyUpdater("generic", "v: 1.0.0-beta.2+build # x-relwolf-version", "1.0.0", "f")).toBe(
      "v: 1.0.0 # x-relwolf-version",
    );
  });

  it("fails when no marker exists", () => {
    expect(() => applyUpdater("generic", "version: 1.0.0", "1.1.0", "f")).toThrow(/no line contains the marker/);
  });

  it("preserves CRLF line endings", () => {
    expect(applyUpdater("generic", "a: 1.0.0 # x-relwolf-version\r\nb: 2\r\n", "1.0.1", "f")).toBe(
      "a: 1.0.1 # x-relwolf-version\r\nb: 2\r\n",
    );
  });
});
