import path from 'path';
import { deleteRemote, fetchRemote, uploadRemote } from './remoteActions';
import createDiffImage from './createDiffs';
import comparisonDataConstructor from './comparisonDataConstructor';
import isEqual from './comparer';
import Reporter from './reporter';

const createComparisons = async (fs, config) => {
  const comparisonData = await comparisonDataConstructor(fs, config);

  const reporter = new Reporter();

  for (let i = 0; i < comparisonData.length; i++) {
    const scenario = comparisonData[i];
    const equal = await isEqual(scenario);

    if (equal) {
      reporter.pass(scenario.label);
    } else {
      reporter.fail(scenario.label);
      await createDiffImage(scenario);
    }
  }

  if (config.remote) await uploadRemote('generatedDiffs', config);

  reporter.exit();
};

const createDirectories = (fs, config) =>
  new Promise(resolve => {
    const directories = [];
    directories.push(config.latest, config.generatedDiffs, config.baseline);

    directories.forEach(dir => {
      fs.access(path.resolve(dir), err => {
        if (err) {
          fs.mkdirSync(path.resolve(dir));
        }
      });
    });

    resolve();
  });

const clearDirectory = (fs, config) => {
  const diffsPath = path.resolve(config.generatedDiffs);
  fs.readdirSync(diffsPath).forEach(file => {
    fs.unlinkSync(`${diffsPath}/${file}`);
  });
};

const fetchRemoteComparisonImages = async (key, config) => {
  if (config.remote) {
    await deleteRemote('generatedDiffs', config);
    for (let i = 0; i < config.scenarios.length; i++) {
      await fetchRemote(config, 'baseline', `${config.scenarios[i].label}.png`);
    }
  }
};

export {
  createComparisons,
  createDirectories,
  clearDirectory,
  fetchRemoteComparisonImages
};
