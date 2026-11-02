import {GitHubSandbox} from './github-sandbox.js';
import {defineReleaseScenarios} from './scenarios.js';

defineReleaseScenarios('GitHub', GitHubSandbox.fromEnv(process.env));
