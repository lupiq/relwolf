import {GitLabSandbox} from './gitlab-sandbox.js';
import {defineReleaseScenarios} from './scenarios.js';

defineReleaseScenarios('GitLab', GitLabSandbox.fromEnv(process.env));
