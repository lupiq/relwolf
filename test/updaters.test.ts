import {describe, expect, it} from 'vitest';
import {applyUpdater, companions, UpdaterError} from '../src/updaters/index.js';

describe('package-json updater', () => {
  it('updates the version and preserves indentation and trailing newline', () => {
    const input =
      '{\n    "name": "x",\n    "version": "1.0.0",\n    "dependencies": { "y": "1.0.0" }\n}\n';
    const output = applyUpdater('package-json', input, '1.1.0', 'package.json');

    expect(JSON.parse(output)).toEqual({
      name: 'x',
      version: '1.1.0',
      dependencies: {y: '1.0.0'},
    });
    expect(output.startsWith('{\n    "name"')).toBe(true);
    expect(output.endsWith('}\n')).toBe(true);
  });

  it('does not add a trailing newline when there was none', () => {
    expect(
      applyUpdater('package-json', '{"version":"1.0.0"}', '2.0.0', 'p.json'),
    ).toBe('{\n  "version": "2.0.0"\n}');
  });

  it('fails on invalid json or missing version', () => {
    expect(() => applyUpdater('package-json', '{', '1.0.0', 'p.json')).toThrow(
      UpdaterError,
    );
    expect(() =>
      applyUpdater('package-json', '{"name":"x"}', '1.0.0', 'p.json'),
    ).toThrow(/version/);
    expect(() => applyUpdater('package-json', '[]', '1.0.0', 'p.json')).toThrow(
      /version/,
    );
  });
});

describe('pom-xml updater', () => {
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

  it('only changes the project version', () => {
    expect(
      applyUpdater('pom-xml', pom('1.0.0-SNAPSHOT'), '1.1.0', 'pom.xml'),
    ).toBe(pom('1.1.0'));
  });

  it('handles self-closing elements and attributes', () => {
    const input = '<project a="b>c"><x/><version>1.0.0</version></project>';

    expect(applyUpdater('pom-xml', input, '2.0.0', 'pom.xml')).toBe(
      '<project a="b>c"><x/><version>2.0.0</version></project>',
    );
  });

  it('fails when the project has no own version', () => {
    const input = '<project><parent><version>1</version></parent></project>';

    expect(() => applyUpdater('pom-xml', input, '1.0.0', 'pom.xml')).toThrow(
      UpdaterError,
    );
  });
});

describe('gradle updater', () => {
  it.each([
    ["version = '1.0.0'", "version = '2.0.0'"],
    ['version = "1.0.0"', 'version = "2.0.0"'],
    ['version "1.0.0"', 'version "2.0.0"'],
    ["version='1.0.0-SNAPSHOT'", "version='2.0.0'"],
  ])('updates %s', (input, expected) => {
    const content = `plugins { id 'java' }\n${input}\ndependencies { implementation 'x:y:1.0.0' }\n`;

    expect(applyUpdater('gradle', content, '2.0.0', 'build.gradle')).toBe(
      `plugins { id 'java' }\n${expected}\ndependencies { implementation 'x:y:1.0.0' }\n`,
    );
  });

  it('ignores indented (non top-level) version lines', () => {
    expect(() =>
      applyUpdater(
        'gradle',
        "tasks {\n  version = '1.0.0'\n}",
        '2.0.0',
        'build.gradle',
      ),
    ).toThrow(UpdaterError);
  });

  it('supports gradle.properties', () => {
    expect(
      applyUpdater(
        'gradle',
        'org.gradle.jvmargs=-Xmx1g\nversion=1.0.0\n',
        '2.0.0',
        'gradle.properties',
      ),
    ).toBe('org.gradle.jvmargs=-Xmx1g\nversion=2.0.0\n');
  });

  it('fails without a version', () => {
    expect(() =>
      applyUpdater('gradle', 'plugins {}', '1.0.0', 'build.gradle.kts'),
    ).toThrow(/version/);
  });
});

describe('generic updater', () => {
  it('replaces the version on marked lines only', () => {
    const input = [
      'image: foo:1.0.0',
      'version: 1.0.0 # x-relwolf-version',
      '// x-relwolf-version',
      "const VERSION = 'v1.0.0'; // x-relwolf-version",
      'dep: 3.0.0',
    ].join('\n');

    // the pure comment line has no version and must fail, so test it separately
    expect(() => applyUpdater('generic', input, '1.1.0', 'f')).toThrow(
      /contains no matching version/,
    );
    const ok = input
      .split('\n')
      .filter(l => l !== '// x-relwolf-version')
      .join('\n');

    expect(applyUpdater('generic', ok, '1.1.0-beta.1', 'f')).toBe(
      [
        'image: foo:1.0.0',
        'version: 1.1.0-beta.1 # x-relwolf-version',
        "const VERSION = 'v1.1.0-beta.1'; // x-relwolf-version",
        'dep: 3.0.0',
      ].join('\n'),
    );
  });

  it('replaces a pre-release version completely', () => {
    expect(
      applyUpdater(
        'generic',
        'v: 1.0.0-beta.2+build # x-relwolf-version',
        '1.0.0',
        'f',
      ),
    ).toBe('v: 1.0.0 # x-relwolf-version');
  });

  it('updates only the minor or major part for partial markers', () => {
    const input = [
      'a: lupiq/relwolf@v1 # x-relwolf-major',
      'b: relwolf:1.2 # x-relwolf-minor',
      'c: 1.2.3 # x-relwolf-version',
      'd: other@v7',
    ].join('\n');

    expect(applyUpdater('generic', input, '2.0.0', 'f')).toBe(
      [
        'a: lupiq/relwolf@v2 # x-relwolf-major',
        'b: relwolf:2.0 # x-relwolf-minor',
        'c: 2.0.0 # x-relwolf-version',
        'd: other@v7',
      ].join('\n'),
    );
  });

  it('leaves partial markers untouched for pre-releases', () => {
    const input = [
      'a: @v1 # x-relwolf-major',
      'b: 1.2 # x-relwolf-minor',
      'c: 1.2.3 # x-relwolf-version',
    ].join('\n');

    expect(applyUpdater('generic', input, '2.0.0-beta.1', 'f')).toBe(
      [
        'a: @v1 # x-relwolf-major',
        'b: 1.2 # x-relwolf-minor',
        'c: 2.0.0-beta.1 # x-relwolf-version',
      ].join('\n'),
    );
  });

  it('does not take a part of a longer version for a partial marker', () => {
    expect(() =>
      applyUpdater('generic', 'x: 1.2.3 # x-relwolf-minor', '2.0.0', 'f'),
    ).toThrow(/contains no matching version/);
  });

  it('ignores lines that merely mention a marker', () => {
    const input = [
      'x: 1.0.0 # x-relwolf-version',
      'Use `x-relwolf-version` for 1.0.0 like this',
      '<div>1.0.0</div> <!-- x-relwolf-version -->',
    ].join('\n');

    expect(applyUpdater('generic', input, '2.0.0', 'f')).toBe(
      [
        'x: 2.0.0 # x-relwolf-version',
        'Use `x-relwolf-version` for 1.0.0 like this',
        '<div>2.0.0</div> <!-- x-relwolf-version -->',
      ].join('\n'),
    );
  });

  it('fails when no marker exists', () => {
    expect(() =>
      applyUpdater('generic', 'version: 1.0.0', '1.1.0', 'f'),
    ).toThrow(/no line contains one of the markers/);
  });

  it('preserves CRLF line endings', () => {
    expect(
      applyUpdater(
        'generic',
        'a: 1.0.0 # x-relwolf-version\r\nb: 2\r\n',
        '1.0.1',
        'f',
      ),
    ).toBe('a: 1.0.1 # x-relwolf-version\r\nb: 2\r\n');
  });
});

describe('pyproject updater', () => {
  it('updates the PEP 621 version and keeps everything else', () => {
    const input =
      '[build-system]\nrequires = ["x"]\n\n[project]\nname = "demo"\nversion = "1.0.0"  # keep\ndependencies = ["a==1.0.0"]\n\n[tool.other]\nversion = "9"\n';
    const output = applyUpdater('pyproject', input, '1.1.0', 'pyproject.toml');

    expect(output).toBe(input.replace('"1.0.0"  # keep', '"1.1.0"  # keep'));
  });

  it('supports Poetry', () => {
    const input = "[tool.poetry]\nname = 'demo'\nversion = '1.0.0'\n";

    expect(applyUpdater('pyproject', input, '2.0.0', 'pyproject.toml')).toBe(
      "[tool.poetry]\nname = 'demo'\nversion = '2.0.0'\n",
    );
  });

  it('fails for dynamic versions', () => {
    expect(() =>
      applyUpdater(
        'pyproject',
        '[project]\ndynamic = ["version"]\n',
        '1.0.0',
        'pyproject.toml',
      ),
    ).toThrow(/dynamic version/);
  });
});

describe('cargo updater', () => {
  const manifest =
    '[package]\nname = "demo"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1.0.0" }\n';

  it('updates the package version only', () => {
    expect(applyUpdater('cargo', manifest, '0.2.0', 'Cargo.toml')).toBe(
      manifest.replace('"0.1.0"', '"0.2.0"'),
    );
  });

  it('supports workspace.package', () => {
    expect(
      applyUpdater(
        'cargo',
        '[workspace.package]\nversion = "1.0.0"\n',
        '1.1.0',
        'Cargo.toml',
      ),
    ).toBe('[workspace.package]\nversion = "1.1.0"\n');
  });

  it('fails without a version', () => {
    expect(() =>
      applyUpdater('cargo', '[package]\nname = "x"\n', '1.0.0', 'Cargo.toml'),
    ).toThrow(UpdaterError);
  });

  it('updates the own entry in Cargo.lock', () => {
    const lock =
      '[[package]]\nname = "demo"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "0.1.0"\n';
    const [companion] = companions('cargo', 'sub/Cargo.toml', manifest);

    expect(companion!.path).toBe('sub/Cargo.lock');
    expect(companion!.update(lock, '0.2.0')).toBe(
      lock.replace('demo"\nversion = "0.1.0', 'demo"\nversion = "0.2.0'),
    );
    expect(() => companion!.update('', '0.2.0')).toThrow(/entry for "demo"/);
  });

  it('has no lockfile companion without a package name', () => {
    expect(companions('cargo', 'Cargo.toml', '[workspace]\n')).toEqual([]);
  });
});

describe('dotnet updater', () => {
  it('updates the first <Version>', () => {
    const input =
      '<Project>\n  <PropertyGroup>\n    <Version>1.0.0</Version>\n  </PropertyGroup>\n</Project>\n';

    expect(applyUpdater('dotnet', input, '1.1.0', 'a.csproj')).toBe(
      input.replace('1.0.0', '1.1.0'),
    );
  });

  it('fails without a <Version>', () => {
    expect(() =>
      applyUpdater('dotnet', '<Project/>', '1.0.0', 'a.csproj'),
    ).toThrow(UpdaterError);
  });
});

describe('helm updater', () => {
  it('updates version and appVersion, keeping quotes and comments', () => {
    const input =
      'apiVersion: v2\nname: demo\nversion: 0.1.0 # chart\nappVersion: "0.1.0"\n';

    expect(applyUpdater('helm', input, '0.2.0', 'Chart.yaml')).toBe(
      'apiVersion: v2\nname: demo\nversion: 0.2.0 # chart\nappVersion: "0.2.0"\n',
    );
  });

  it('works without appVersion', () => {
    expect(
      applyUpdater('helm', 'version: 1.0.0\n', '1.1.0', 'Chart.yaml'),
    ).toBe('version: 1.1.0\n');
  });
});

describe('structured updaters', () => {
  it('updates a nested JSON key', () => {
    const output = applyUpdater(
      'json',
      '{"a":{"b":"1.0.0"}}\n',
      '2.0.0',
      'x.json',
      'a.b',
    );

    expect(JSON.parse(output)).toEqual({a: {b: '2.0.0'}});
    expect(() =>
      applyUpdater('json', '{"a":1}', '2.0.0', 'x.json', 'a.b'),
    ).toThrow(/no "a.b" field/);
  });

  it('updates a nested YAML key without touching similar keys', () => {
    const input =
      'name: x\nversion: 1.0.0\nflutter:\n  sdk:\n    version: "3.0.0"\n  other: 1\n';

    expect(
      applyUpdater('yaml', input, '2.0.0', 'p.yaml', 'flutter.sdk.version'),
    ).toBe(input.replace('"3.0.0"', '"2.0.0"'));
    expect(applyUpdater('yaml', input, '2.0.0', 'p.yaml', 'version')).toBe(
      input.replace('version: 1.0.0', 'version: 2.0.0'),
    );
    expect(() =>
      applyUpdater('yaml', input, '2.0.0', 'p.yaml', 'flutter.version'),
    ).toThrow(/no scalar value/);
  });

  it('updates a TOML key path and fails on a missing one', () => {
    const input = 'version = "1.0.0"\n[tool]\nversion = "2.0.0"\n';

    expect(applyUpdater('toml', input, '3.0.0', 'x.toml', 'tool.version')).toBe(
      'version = "1.0.0"\n[tool]\nversion = "3.0.0"\n',
    );
    expect(applyUpdater('toml', input, '3.0.0', 'x.toml', 'version')).toBe(
      'version = "3.0.0"\n[tool]\nversion = "2.0.0"\n',
    );
    expect(() =>
      applyUpdater('toml', input, '3.0.0', 'x.toml', 'nope.version'),
    ).toThrow(UpdaterError);
  });
});

describe('package-lock companions', () => {
  it('updates both root version fields', () => {
    const lock =
      '{\n  "name": "x",\n  "version": "1.0.0",\n  "packages": {\n    "": {\n      "name": "x",\n      "version": "1.0.0"\n    },\n    "node_modules/y": {\n      "version": "1.0.0"\n    }\n  }\n}\n';
    const [companion] = companions('package-json', 'package.json', '{}');
    const output = JSON.parse(companion!.update(lock, '2.0.0'));

    expect(companion!.path).toBe('package-lock.json');
    expect(output.version).toBe('2.0.0');
    expect(output.packages[''].version).toBe('2.0.0');
    expect(output.packages['node_modules/y'].version).toBe('1.0.0');
    expect(() => companion!.update('{}', '2.0.0')).toThrow(UpdaterError);
  });

  it('has no companions for other updaters', () => {
    expect(companions('pom-xml', 'pom.xml', '')).toEqual([]);
  });
});
