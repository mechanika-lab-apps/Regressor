/* eslint-disable import/no-dynamic-require*/

import fs from 'fs';
import jimp from 'jimp';
import logger from './logger';
import { executeScriptWithDriver } from './executeScript';

export default class SnapShotter {
    constructor(
        {
            label = 'label',
            latest = __dirname,
            gridUrl = 'http://localhost:4444',
            width = 700,
            height = 1024,
            browser = 'chrome',
            chromeCustomCapabilities,
            mobileDeviceName,
            cookies,
            cropToSelector,
            removeElements,
            hideElements,
            waitForElement,
            waitForIFrameElement,
            wait,
            url = 'http://localhost:80',
            viewportLabel = 'viewportLabel',
            onBeforeScript,
            onReadyScript
        },
        selenium,
        onComplete,
        onInfo,
        onError
    ) {
        this._label = label;
        this._latest = latest;
        this._gridUrl = gridUrl;
        this._width = width;
        this._height = height;
        this._browser = browser;
        this._chromeCustomCapabilities = chromeCustomCapabilities;
        this._mobileDeviceName = mobileDeviceName;
        this._cookies = cookies;
        this._cropToSelector = cropToSelector;
        this._removeElements = removeElements;
        this._hideElements = hideElements;
        this._waitForElement = waitForElement;
        this._waitForIFrameElement = waitForIFrameElement;
        this._url = url;
        this.wait = wait;
        this._onBeforeScript = onBeforeScript;
        this._onReadyScript = onReadyScript;
        this._viewportLabel = viewportLabel;
        this._By = selenium.By;
        this._until = selenium.until;
        this._webdriver = selenium.webdriver;
        this._onComplete = onComplete;
        this._onInfo = onInfo;
        this._onError = onError;

        const browserCapability = this._browser.includes('chrome')
            ? this._webdriver.Capabilities.chrome
            : this._webdriver.Capabilities.firefox;

        if (mobileDeviceName) this._capability = this.getMobileBrowserCapability();
        else if (chromeCustomCapabilities)
            this._capability = this.getCustomGoogleCapability();
        else this._capability = browserCapability();
    }

    get driver() {
        return this._driver;
    }

    getMobileBrowserCapability() {
        return {
            browserName: 'chrome',
            version: '*',
            'goog:chromeOptions': {
                mobileEmulation: {
                    deviceName: this._mobileDeviceName
                },
                args: ['incognito']
            }
        };
    }

    getCustomGoogleCapability() {
        return {
            browserName: 'chrome',
            version: '*',
            'goog:chromeOptions': this._chromeCustomCapabilities
        };
    }

    async snooze(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async removeTheSelectors() {
        for (let i = 0; i < this._removeElements.length; i++) {
            const script = `document.querySelectorAll('${
                this._removeElements[i]
            }').forEach(element => element.remove())`;

            await this.driver.executeScript(script);
        }
    }

    async hideTheSelectors() {
        for (let i = 0; i < this._hideElements.length; i++) {
            const script = `document.querySelectorAll('${
                this._hideElements[i]
            }').forEach(element => element.style.opacity = '0')`;

            await this.driver.executeScript(script);
        }
    }

    async applyCookies() {
        for (let i = 0; i < this._cookies.length; i++) {
            const { name, value } = this._cookies[i];

            await this.driver.manage().addCookie({
                name,
                value
            });
        }

        await this.driver.get(this._url);
    }

    async waitForElement() {
        const timeout = 10000;
        const element = await this.driver.findElement(
            this._By.css(this._waitForElement)
        );

        try {
            await this.driver.wait(this._until.elementIsVisible(element), timeout);
        } catch (error) {
            console.log(''); // eslint-disable-line no-console // space for progress bar
            logger.error(
                'snapshotter',
                `❌  Unable to find the specified waitForElement element on the page! ❌ ${error}`
            );
        }
    }

    switchToIFrame(selector, timeout) {
        return this.driver.wait(
            this._until.ableToSwitchToFrame(this._By.css(selector)),
            timeout
        );
    }

    waitToLocateElement(selector, timeout) {
        return this.driver.wait(
            this._until.elementLocated(this._By.css(selector)),
            timeout
        );
    }

    async waitForIFrameElement() {
        const timeout = 10000;

        const { frame, element } = this._waitForIFrameElement;

        try {
            await this.switchToIFrame(frame, timeout);
            await this.waitToLocateElement(element, timeout);
        } catch (error) {
            console.log(''); // eslint-disable-line no-console // space for progress bar
            logger.error(
                'snapshotter',
                `❌  Unable to find the specified waitForIFrameElement element on the page for ${
                    this._label
                } ❌ ${error}`
            );
        } finally {
            await this.driver.switchTo().defaultContent();
        }
    }

    getElementDimensions(selector) {
        return this._driver
            .findElement(this._By.css(selector))
            .getRect()
            .then(dimensions => {
                if (!dimensions)
                    throw new Error(
                        `"cropToSelector" (${selector}') could not be found on the page.`
                    );
                return dimensions;
            });
    }

    async writeCroppedScreenshot(filename, screenshot, selector) {
        logger.verbose('Cropping', `selector: ${selector}`);
        const { x, y, width, height } = await this.getElementDimensions(selector);

        await jimp
            .read(Buffer.from(screenshot, 'base64'))
            .then(image => image.crop(x, y, width, height))
            .then(cropped => cropped.write(filename));
    }

    writeScreenshot(filename, screenshot) {
        fs.writeFileSync(filename, screenshot, 'base64');
    }

    handleScriptError(error) {
        logger.error(
            'snapshotter',
            `❌  Unable to run script for scenario: ${
                this._label
            } \n  due to: ${error}`
        );
    }

    async driverSetup() {
        this._driver = await new this._webdriver.Builder()
            .usingServer(this._gridUrl)
            .withCapabilities(this._capability)
            .build();
        logger.verbose(
            'Snapshotting',
            `${this._label}-${this._viewportLabel} : Url: ${this._url}`
        );
        await this.driver.get(this._url);

        await this._driver
            .manage()
            .window()
            .setRect({
                width: this._width,
                height: this._height
            });
    }

    async preSnapshootSetup() {
        try {
            if (this._onBeforeScript)
                await executeScriptWithDriver(this._driver, this._onBeforeScript).catch(
                    this.handleScriptError
                );

            if (this._cookies) await this.applyCookies();

            if (this._waitForElement) await this.waitForElement();

            if (this._waitForIFrameElement) await this.waitForIFrameElement();

            if (this._onReadyScript)
                await executeScriptWithDriver(this._driver, this._onReadyScript).catch(
                    this.handleScriptError
                );

            if (this._hideElements) await this.hideTheSelectors();

            if (this._removeElements) await this.removeTheSelectors();

            if (this.wait) await this.snooze(this.wait);
        } catch (err) {
            this._onInfo();
            logger.info(`Pre-snapshoot error: ${err}`);
        }
    }

    async takeSnap() {
        const filename = `${this._latest}/${this._label}-${
            this._viewportLabel
        }.png`;

        try {
            await this.driverSetup();
        } catch (err) {
            this._onError();
            logger.error(
                'snapshotter',
                `❌  Unable to connect to the grid at ${this._gridUrl}`
            );
            process.exitCode = 1;
            return;
        }

        await this.preSnapshootSetup();

        try {
            const screenshot = await this.driver.takeScreenshot();

            if (this._cropToSelector) {
                await this.writeCroppedScreenshot(
                    filename,
                    screenshot,
                    this._cropToSelector
                );
            } else {
                this.writeScreenshot(filename, screenshot);
            }
        } catch (err) {
            this._onError();
            logger.error(
                'snapshotter',
                `❌  Unable to take snapshot for ${this._label}-${
                    this._viewportLabel
                }! ❌   : ${err}`
            );
            process.exitCode = 1;
        } finally {
            if (this.driver) await this.driver.quit();
        }
        this._onComplete();
    }
}
