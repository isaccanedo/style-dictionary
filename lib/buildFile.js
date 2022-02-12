/*
 * Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with
 * the License. A copy of the License is located at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

var path = require('path'),
    fs   = require('fs-extra'),
    chalk = require('chalk'),
    filterProperties = require('./filterProperties'),
    GroupMessages = require('./utils/groupMessages');

const createFormatArgs = require('./utils/createFormatArgs');

/**
 * Takes the style property object and a format and returns a
 * string that can be written to a file.
 * @memberOf StyleDictionary
 * @param {Object} file
 * @param {Object} platform
 * @param {Object} dictionary
 * @returns {null}
 */
function buildFile(file = {}, platform = {}, dictionary = {}) {
  var { destination, filter, format } = file || {};

  if (typeof format !== 'function')
    throw new Error('Please enter a valid file format');
  if (typeof destination !== 'string')
    throw new Error('Please enter a valid destination');

  // get if the format is nested, this needs to be done before
  // the function is bound
  const nested = format.nested;
  // to maintain backwards compatibility we bind the format to the file object
  format = format.bind(file);
  var fullDestination = destination;

  // if there is a build path, prepend the full destination with it
  if (platform.buildPath) {
    fullDestination = platform.buildPath + fullDestination;
  }

  var dirname = path.dirname(fullDestination);
  if (!fs.existsSync(dirname))
    fs.mkdirsSync(dirname);

  const filteredProperties = filterProperties(dictionary, filter);
  const filteredDictionary = Object.assign({}, dictionary, {
    properties: filteredProperties.properties,
    allProperties: filteredProperties.allProperties,
    tokens: filteredProperties.properties,
    allTokens: filteredProperties.allProperties,
    // keep the unfiltered properties object for reference resolution
    _properties: dictionary.properties
  });

  // if properties object is empty, return without creating a file
  if (
    filteredProperties.hasOwnProperty('properties') &&
    Object.keys(filteredProperties.properties).length === 0 &&
    filteredProperties.properties.constructor === Object
  ) {
    let warnNoFile = `No properties for ${destination}. File not created.`;
    console.log(chalk.keyword('darkorange')(warnNoFile));
    return null;
  }

  // Check for property name Collisions
  var nameCollisionObj = {};
  filteredProperties.allProperties && filteredProperties.allProperties.forEach((propertyData) => {
    let propertyName = propertyData.name;
    if(!nameCollisionObj[propertyName]) {
      nameCollisionObj[propertyName] = [];
    }
    nameCollisionObj[propertyName].push(propertyData);
  });

  var PROPERTY_NAME_COLLISION_WARNINGS = GroupMessages.GROUP.PropertyNameCollisionWarnings + ":" + destination;
  GroupMessages.clear(PROPERTY_NAME_COLLISION_WARNINGS);
  Object.keys(nameCollisionObj).forEach((propertyName) => {
    if(nameCollisionObj[propertyName].length > 1) {
      let collisions = nameCollisionObj[propertyName].map((properties) => {
        let propertyPathText = chalk.keyword('orangered')(properties.path.join('.'));
        let valueText = chalk.keyword('darkorange')(properties.value);
        return propertyPathText + '   ' + valueText;
      }).join('\n        ');
      GroupMessages.add(
        PROPERTY_NAME_COLLISION_WARNINGS,
        `Output name ${chalk.keyword('orangered').bold(propertyName)} was generated by:\n        ${collisions}`
      );
    }
  });

  let propertyNamesCollisionCount = GroupMessages.count(PROPERTY_NAME_COLLISION_WARNINGS);
  fs.writeFileSync(fullDestination, format(createFormatArgs({
    dictionary: filteredDictionary,
    platform,
    file
  }), platform, file));

  let filteredReferencesCount = GroupMessages.count(GroupMessages.GROUP.FilteredOutputReferences);

  // don't show name collision warnings for nested type formats
  // because they are not relevant.
  if ((nested || propertyNamesCollisionCount === 0) && filteredReferencesCount === 0) {
    console.log( chalk.bold.green(`✔︎ ${fullDestination}`) );
  } else {
    console.log( `⚠️ ${fullDestination}`);
    if (propertyNamesCollisionCount > 0) {
      let propertyNamesCollisionWarnings = GroupMessages.fetchMessages(PROPERTY_NAME_COLLISION_WARNINGS).join('\n    ');
      let title = `While building ${chalk.keyword('orangered').bold(destination)}, token collisions were found; output may be unexpected.`;
      let help = chalk.keyword('orange')([
        'This many-to-one issue is usually caused by some combination of:',
            '* conflicting or similar paths/names in property definitions',
            '* platform transforms/transformGroups affecting names, especially when removing specificity',
            '* overly inclusive file filters',
      ].join('\n    '));
      let warn = `${title}\n    ${propertyNamesCollisionWarnings}\n${help}`;
      console.log(chalk.keyword('darkorange').bold(warn));
    }

    if (filteredReferencesCount > 0) {
      let filteredReferencesWarnings = GroupMessages.flush(GroupMessages.GROUP.FilteredOutputReferences).join('\n    ');
      let title = `While building ${chalk.keyword('orangered').bold(destination)}, filtered out token references were found; output may be unexpected. Here are the references that are used but not defined in the file`;
      let help = chalk.keyword('orange')([
        'This is caused when combining a filter and `outputReferences`.',
      ].join('\n    '));
      let warn = `${title}\n    ${filteredReferencesWarnings}\n${help}`;
      console.log(chalk.keyword('darkorange').bold(warn));
    }
  }
}


module.exports = buildFile;