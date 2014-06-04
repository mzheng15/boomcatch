// Copyright © 2014 Nature Publishing Group
//
// This file is part of boomcatch.
//
// Boomcatch is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Boomcatch is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with boomcatch. If not, see <http://www.gnu.org/licenses/>.

/*globals module, require */

'use strict';

var fs = require('fs'),
    check = require('check-types'),
    handlebars = require('handlebars');

module.exports = {
    initialise: function (options) {
        return map.bind(null, getTemplate(options), getSettings(options));
    }
};

function getTemplate (options) {
    return handlebars.compile(fs.readFileSync(options.svgTemplate || './template.html', { encoding: 'utf8' }));
}

function getSettings (options) {
    var settings = require(options.svgSettings || './settings.json');

    verifySettings(settings);

    settings.xAxis = {
        x: settings.width / 1.8,
        y: settings.offset.y / 2 - settings.padding
    };

    settings.resourceHeight = settings.barHeight + settings.padding;
    settings.barPadding = Math.floor(settings.padding / 2);

    return settings;
}

function verifySettings (settings) {
    check.verify.positiveNumber(settings.width, 'Invalid SVG width');
    check.verify.object(settings.offset, 'Invalid SVG offset');
    check.verify.positiveNumber(settings.offset.x, 'Invalid SVG x offset');
    check.verify.positiveNumber(settings.offset.x, 'Invalid SVG y offset');
    check.verify.positiveNumber(settings.barHeight, 'Invalid SVG bar height');
    check.verify.positiveNumber(settings.padding, 'Invalid SVG padding');
    check.verify.array(settings.colours, 'Invalid SVG colours');

    if (settings.colours.length !== 6) {
        throw new Error('Incorrect number of SVG colours');
    }

    settings.colours.forEach(function (colour, index) {
        check.verify.object(colour, 'Invalid SVG colour [' + index + ']');
        check.verify.unemptyString(colour.name, 'Invalid SVG colour name [' + index + ']');
        check.verify.unemptyString(colour.value, 'Invalid SVG colour value [' + index + ']');
        check.verify.unemptyString(colour.fg, 'Invalid SVG foreground colour [' + index + ']');
    });
}

function map (template, settings, data, referer) {
    var resources;

    if (!Array.isArray(data.restiming)) {
        return '';
    }

    resources = data.restiming.map(mapResource.bind(null, referer));

    return template({
        svg: customiseSvgSettings(settings, resources),
        details: resources
    });
}

function mapResource (referer, resource) {
    var duration, result;
    
    duration = Object.keys(resource.events).reduce(
        getResourceDuration.bind(null, resource),
        resource.timestamps.fetchStart - resource.timestamps.start
    );

    result = {
        page: referer,
        name: resource.name,
        type: resource.type,
        start: resource.timestamps.start,
        duration: duration,
        timings: [
            mapTiming('blocked', { start: resource.timestamps.start, duration: duration }),
            mapEvent('redirect', resource),
            mapEvent('dns', resource),
            mapEvent('connect', resource),
            mapRequestTiming(resource),
            mapEvent('response', resource)
        ]
    };

    result.timings[0].blocked = true;

    return result;
}

function getResourceDuration (resource, duration, eventName) {
    var eventDuration = resource.events[eventName].end - resource.timestamps.start;

    if (eventDuration > duration) {
        return eventDuration;
    }

    return duration;
}

function mapTiming (name, event) {
    if (event) {
        return {
            name: name,
            start: event.start,
            duration: event.end - event.start
        };
    }

    return mapTiming(name, { start: 0, end: 0 });
}

function mapEvent (name, resource) {
    return mapTiming(name, resource.events[name]);
}

function mapRequestTiming (resource) {
    var requestTiming;

    if (resource.timestamps.requestStart && resource.events.response) {
        requestTiming = {
            start: resource.timestamps.requestStart,
            end: resource.events.response.start
        };
    }

    return mapTiming('request', requestTiming);
}

function customiseSvgSettings (settings, resources) {
    var result = {};

    Object.keys(settings).forEach(function (name) {
        result[name] = settings[name];
    });

    result.height = getSvgHeight(settings, resources);
    result.ticks = getSvgTicks(settings, resources);
    result.resources = resources.map(mapSvgResource.bind(null, settings));

    return result;
}

function getSvgHeight (settings, resources) {
    return (resources.length + 1) * (settings.barHeight + settings.padding) + settings.offset.x;
}

function getSvgTicks (settings, resources) {
    var minimum, maximum, step, difference, width, height, pixelsPerUnit, ticks;

    minimum = resources[0].start;
    maximum = resources.reduce(getMaximumValue, 0);
    step = Math.ceil((maximum - minimum) / 5);
    maximum += step - (maximum % step);
    minimum -= minimum % step;
    difference = maximum - minimum;
    width = settings.width - settings.offset.x;
    height = resources.length * (settings.barHeight + settings.padding);
    pixelsPerUnit = width / difference;

    ticks = new Array(difference / step);
    ticks.forEach(function (t, index) {
        var value = index * step;

        ticks[index] = {
            x: getXPosition(value),
            height: height,
            value: value
        };
    });

    return ticks;

    function getXPosition (value) {
        if (value === 0) {
            return 0;
        }

        return (value - minimum) * pixelsPerUnit;
    }
}

function getMaximumValue (maximum, resource) {
    var end = resource.start + resource.duration;

    if (end > maximum) {
        return end;
    }

    return maximum;
}

function mapSvgResource (settings, resource, index) {
}

