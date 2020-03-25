/*eslint camelcase: ["error", {properties: "never"}]*/

import { flatten } from 'lodash';
import CBTConnector from 'cbt_tunnels';
import request from 'request-promise';
import wd from 'wd';

if (!process.env.CBT_DEBUG)
    console.error = () => {};

import { promisify } from 'util';

CBTConnector.startp = promisify(CBTConnector.start);

var openedBrowsers = {};
var webDriver;

let tunnel;

const tunnelName = Buffer.from(Math.random().toString()).toString('hex');

const AUTH_FAILED_ERROR = 'Authentication failed. Please assign the correct username and access key ' +
    'to the CBT_TUNNELS_USERNAME and CBT_TUNNELS_AUTHKEY environment variables.';

const CBT_API_PATHS = {
    browserList: {
        url: 'https://crossbrowsertesting.com/api/v3/selenium/browsers?format=json'
    },
    tunnelInfo: {
        url: 'https://crossbrowsertesting.com/api/v3/tunnels?active=true'
    },
    deleteTunnel: id => ({
        url:    `https://crossbrowsertesting.com/api/v3/tunnels/${id}`,
        method: 'DELETE'
    }),
    seleniumTestHistory: {
        url: 'https://crossbrowsertesting.com/api/v3/selenium?active=true'
    },
    deleteBrowser: id => ({
        url:    `https://crossbrowsertesting.com/api/v3/selenium/${id}`,
        method: 'DELETE'
    })
};

function doRequest (apiPath) {
    var url = apiPath.url;

    var opts = {
        auth: {
            user: process.env['CBT_TUNNELS_USERNAME'],
            pass: process.env['CBT_TUNNELS_AUTHKEY'],
        },

        method: apiPath.method || 'GET'
    };

    return request(url, opts)
        .catch(error => {
            throw error;
        });
}

async function startBrowser (id, url, capabilities) {
    webDriver = wd.promiseChainRemote('hub.crossbrowsertesting.com', 80, process.env['CBT_TUNNELS_USERNAME'], process.env['CBT_TUNNELS_AUTHKEY']);
    openedBrowsers[id] = webDriver;

    try {
        await webDriver
        .init(capabilities)
        .get(url);
    }
    catch (error) {
        throw error;
    }
}

async function _afterTunnel (id, pageUrl, browserName) {

    var colon = browserName.indexOf(':');

    if (colon > -1) {
        var platform = browserName.substr(colon + 1);

        browserName = browserName.substr(0, colon);
    }
    var at = browserName.indexOf('@');

    if (at > -1) {
        var version = browserName.substr(at + 1);

        browserName = browserName.substr(0, at);
    }

    var capabilities;

    if (browserName !== 'Chrome Mobile' && browserName !== 'Mobile Safari') {
        capabilities = {
            browserName: browserName,
            version:     version,
            platform:    platform,
            tunnelname:  tunnelName
        };
    }
    else {
        capabilities = {
            browserName:     browserName,
            platformVersion: version,
            deviceName:      platform,
            tunnelname:      tunnelName
        };
    }

    capabilities.idleTimeout = '3600';
    console.error(`Starting test for browser: ${browserName}`);
    // CrossBrowserTesting-Specific Capabilities
    capabilities.name = `TestCafe test run ${id}`;
    if (process.env.CBT_BUILD)
        capabilities.build = process.env.CBT_BUILD;
    if (process.env.CBT_RECORD_VIDEO)
        capabilities.record_video = process.env.CBT_RECORD_VIDEO.match(/true/i);
    if (process.env.CBT_RECORD_NETWORK)
        capabilities.record_video = process.env.CBT_RECORD_NETWORK.match(/true/i);
    if (process.env.CBT_MAX_DURATION)
        capabilities.max_duration = process.env.CBT_MAX_DURATION;

    if (browserName.indexOf('Chrome') !== -1 && process.env.CBT_CHROME_ARGS && process.env.CBT_CHROME_ARGS.length > 0)
        capabilities.chromeOptions = { args: [process.env.CBT_CHROME_ARGS] };

    await startBrowser(id, pageUrl, capabilities);
}

async function _pollForTunnel () {
    return new Promise( (res, rej) => {
        let timeout = null;
        let interval = null;

        timeout = setTimeout(function () {
            clearInterval(interval);
            clearTimeout(timeout);
            const errMessage = 'Could not find running cbt_tunnels in time';

            console.error(errMessage);
            const err = new Error(errMessage);

            rej(err);
        }, 30000);

        interval = setInterval( async function () {
            const tunnelList = JSON.parse(await doRequest(CBT_API_PATHS.tunnelInfo));

            if (tunnelList.meta.record_count >= 1) {
                for (let i = 0; i < tunnelList.meta.record_count; i++) {
                    console.error('Checking for tunnel in tunnel list', tunnelList.tunnels[i]);
                    if (tunnelList.tunnels[i].tunnel_name === tunnelName &&
                        tunnelList.tunnels[i].state === 'running') {
                        console.error('Found running tunnel');
                        clearInterval(interval);
                        clearTimeout(timeout);
                        res(true);
                    }
                }
            }
        }, 1000);
    });

}

export default {
    // Multiple browsers support
    isMultiBrowser: true,
    platformsInfo:  [],
    browserNames:   [],

    async _getDeviceList () {
        this.myArr = JSON.parse(await doRequest(CBT_API_PATHS.browserList));

        this.browserNames = this.myArr
            .map(info => {
                if (info['device'] === 'mobile') {
                    this.name = info['browsers'][0]['type'];
                    this.version = info['caps'].platformVersion;
                    this.OS = info['caps'].deviceName;
                    return `${this.name}@${this.version}:${this.OS}`;
                }

                this.arrList = [];
                this.OS = info['name'];

                for (var i = 0; i < info['browsers'].length; i++) {
                    this.name = info['browsers'][i]['type'];
                    this.version = info['browsers'][i]['version'];
                    this.arrList.push(`${this.name}@${this.version}:${this.OS}`);
                }
                return this.arrList;
            });

        this.browserNames = flatten( this.browserNames);
    },


    // Required - must be implemented
    // Browser control
    async openBrowser (id, pageUrl, browserName) {
        if (!process.env['CBT_TUNNELS_USERNAME'] || !process.env['CBT_TUNNELS_AUTHKEY'])
            throw new Error(AUTH_FAILED_ERROR);

        if (!tunnel) {
            console.error(`No tunnel started, starting tunnel for session ${id}`);

            tunnel = true;
            await CBTConnector.startp(
                {
                    'tunnelname': tunnelName,
                    'username':   process.env['CBT_TUNNELS_USERNAME'],
                    'authkey':    process.env['CBT_TUNNELS_AUTHKEY'] },
            );
        }
        else await _pollForTunnel(id);

        await _afterTunnel(id, pageUrl, browserName);
    },

    async closeBrowser (id) {
        await openedBrowsers[id].quit();
    },


    // Optional - implement methods you need, remove other methods
    // Initialization
    async init () {
        if (!process.env['CBT_TUNNELS_USERNAME'] || !process.env['CBT_TUNNELS_AUTHKEY'])
            throw new Error(AUTH_FAILED_ERROR);

        await this._getDeviceList();
    },

    async dispose () {
        this.seleniumHistoryList = JSON.parse(await doRequest(CBT_API_PATHS.seleniumTestHistory));
        if (this.seleniumHistoryList.meta.record_count >= 1) {
            for (let i = 0; i < this.seleniumHistoryList.meta.record_count; i++) {
                this.seleniumTestID = this.seleniumHistoryList.selenium[i].selenium_test_id;
                await doRequest(CBT_API_PATHS.deleteBrowser(this.seleniumTestID));
            }
        }

        this.tunnelList = JSON.parse(await doRequest(CBT_API_PATHS.tunnelInfo));
        if (this.tunnelList.meta.record_count >= 1) {
            for (let i = 0; i < this.tunnelList.meta.record_count; i++) {
                this.tunnelID = this.tunnelList.tunnels[i].tunnel_id;
                await doRequest(CBT_API_PATHS.deleteTunnel(this.tunnelID));
            }
        }
    },

    // Browser names handling
    async getBrowserList () {
        return this.browserNames;
    },

    async isValidBrowserName (/* browserName */) {
        return true;
    },


    // Extra methods
    async resizeWindow (id, width, height /*, currentWidth, currentHeight*/) {
        await openedBrowsers[id].setWindowSize(width, height);
    },

    async maximizeWindow (id) {
        await openedBrowsers[id].maximize();
    },

    async takeScreenshot (/* id, screenshotPath, pageWidth, pageHeight */) {
        this.reportWarning('The screenshot functionality is not supported by the "crossbrowsertesting" browser provider.');
    }
};
