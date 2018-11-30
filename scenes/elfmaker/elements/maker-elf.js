import {html, LitElement, svg} from '@polymer/lit-element';
import {render} from 'lit-html';

import * as prefix from '../../../src/lib/prefix.js';
import * as defs from '../defs.js';

import {defaultCategoryChoices} from './maker-control.js';


function interpolateAngle(start, c1, c2, end) {
	return (t) => {
    const tangentX =
      (3 * Math.pow(1 - t, 2) * (c1.x - start.x)) +
      (6 * (1 - t) * t * (c2.x - c1.x)) +
      (3 * Math.pow(t, 2) * (end.x - c2.x));
    const tangentY =
      (3 * Math.pow(1 - t, 2) * (c1.y - start.y)) +
      (6 * (1 - t) * t * (c2.y - c1.y)) +
      (3 * Math.pow(t, 2) * (end.y - c2.y));
    return Math.atan2(tangentY, tangentX) * (180 / Math.PI);
  }
}


function scaleAt(scaleX, scaleY, x, y) {
  return `matrix(${scaleX}, 0, 0, ${scaleY}, ${x - scaleX * x}, ${y - scaleY * y})`;
}


export class MakerElfElement extends LitElement {
  static get properties() {
    return {
      svgStyle: {type: String},
      categoryChoice: {type: Object},
      _offset: {type: Number},
      _idPrefix: {type: String},
      _danceTime: {type: Number}
    };
  }

  constructor() {
    super();

    this._danceDuration = 3000;
    this._moveDuration = this._danceDuration / 6;
    this._danceMoves = [[30, 140], [140, 30], [80, 180], [180, 80], [20, 20], [60, 60]];

    // Edge fails to ever render if it has NaN/invalid data, so set all defaults here.
    this._offset = 0;
    this._idPrefix = prefix.id();
    this.svgStyle = '';
    this.categoryChoice = defaultCategoryChoices();
  }

  _buildArm(angle = 0, shrug = 1, length = 120) {
    const rads = (angle / 180) * Math.PI;

    // Make the arm shorter the more the bezier curve takes effect. 90 degrees (pi/2) is the
    // highest length, as it's directly out to the side: 270 is lowest, back over the body.
    length *= (Math.sin(rads) + 1) / 2;

    const offset = {x: Math.sin(rads) * length, y: Math.cos(rads) * length};

    const bodyControl = {x: shrug * -length / 3, y: -4};  // 40.51 goes away from start arm
    const handControl = {x: length * -0.75, y: 0};

    const interpolate = interpolateAngle(
        {x: 0, y: 0},
        bodyControl,
        handControl,
        {x: -offset.x, y: offset.y},
    );
    const angleAt = interpolate(1) - 90;

    return svg`
<path class="limb arm" d="M0,0c${bodyControl.x},${bodyControl.y},${handControl.x},${handControl.y},${- offset.x},${offset.y}" pathLength="${length / 2}" />
<g transform="translate(${- offset.x}, ${offset.y}) rotate(${angleAt})">
  <circle class="skin" cx="0" cy="0" r="21.32"/>
  <path transform="translate(-48.8, -303.89)" class="white" d="M66.87,272.56H30.73a10,10,0,0,0,0,20H66.87a10,10,0,0,0,0-20Z"/>
</g>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    const run = () => {
      if (!this.isConnected) {
        return;
      }
      window.requestAnimationFrame(run);
      this._offset = (performance.now() / 1000);
    };
    run();
  }

  /**
   * @return {!Promise<string>}
   */
  async draw() {
    const canvasWidth = defs.width * 2;
    const canvasHeight = defs.height * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    const bg = new Image();
    bg.src = defs.categoryChoice(this.categoryChoice, 'backgrounds');
    await new Promise((resolve, reject) => {
      bg.onload = resolve;
      bg.onerror = reject;
    });

    // draw the center of the scaled background image
    const bgScale = 1.2;
    const sw = canvasWidth / bgScale;
    const sh = canvasHeight / bgScale;
    const sx = (bg.width - sw) / 2;
    const sy = (bg.height - sh) / 2;
    ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);

    // create div, find the svg
    const div = document.createElement('div');
    render(this.render(true), div);
    const svg = div.querySelector('svg');

    // set w/h explicitly, otherwise Chrome or other browsers assume 'natural' SVG size
    svg.setAttribute('width', canvasWidth);
    svg.setAttribute('height', canvasHeight);

    // load the elf image with the base64 version of the SVG
    const elf = new Image();
    elf.src = 'data:image/svg+xml;base64,' + window.btoa(svg.outerHTML);
    await new Promise((resolve, reject) => {
      elf.onload = resolve;
      elf.onerror = reject;
    });

    ctx.drawImage(elf, 0, 0);
    return canvas.toDataURL();
  }

  dance() {
    if (!this._isDancing) {
      this._danceTime = performance.now();
    }
  }

  get _isDancing() {
    return (performance.now() - this._danceTime) < this._danceDuration;
  }

  _getCurrentDanceMove() {
    const danceTime = performance.now() - this._danceTime;
    const moveIndex = Math.min(
        Math.max(Math.floor(danceTime / this._moveDuration), 0), this._danceMoves.length - 1);

    return this._danceMoves[moveIndex];
  }

  /**
   * @param {boolean} force include CSS, for ShadyCSS modes
   */
  render(force) {
    const armDegrees = this._isDancing ?
        this._getCurrentDanceMove() :
        [100 + (50 * Math.cos(this._offset / 0.8)), 135 + (10 * Math.sin(this._offset * 1.5))];
    const [rightArmDegrees, leftArmDegrees] = armDegrees;

    const shrug = (Math.cos(this._offset) + 1) / 2;
    const bodyDegrees = (Math.cos(this._offset) * 0.5) * 10;
    const bodyType = defs.bodyTypes[this.categoryChoice['body']];

    // normally 20px, but adjust for weight (18-26)
    const limbWidth = (18 + bodyType['weight'] * 8);
    const legLength = (bodyType['height'] || 0) * 96 + 32;
    const armLength = (bodyType['height'] || 0) * 64 + 96;

    // feet are drawn at 20px, but unlike arms, we scale them (so shoes also get scaled)
    const scale = (limbWidth / 20);
    const bodyScale = Math.sqrt(limbWidth / 20);

    // only render real styles in Shadow DOM
    const svgStyle = (!force && self.ShadyCSS ? '' : this.svgStyle);

    return html`
<style>
:host {
  height: 100%;
  display: inline-block;
}
.shadow {
  height: 100%;
  display: flex;
  justify-content: center;
  will-change: transform;  /* nb. gives about 3x speedup */
  filter: drop-shadow(4px 4px 2px rgba(0, 0, 0, 0.125));
}
svg {
  width: 100%;
  height: 100%;
}
</style>

<div class="shadow">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="-40 -100 400 560">
  <style>
${defs.baseSvgStyle}
${svgStyle}
.blink {
  animation: elves-blink 5.234s infinite alternate;
}

.dance {
  transform-origin: center 100%;
  animation: elves-dance 3s ease-in-out infinite alternate;
}

@keyframes elves-blink {
  0%   { transform: scaleY(1); }
  98%  { transform: scaleY(1); }
  100% { transform: scaleY(0); }
}

@keyframes elves-dance {
  0%     { transform: translate3d(0, 0, 0) rotateZ(0); }
  6.25%  { transform: translate3d(2.5%, -10%, 0) rotateZ(7.5deg); }
  12.5%  { transform: translate3d(0, 0, 0) rotateZ(7.5deg); }
  18.75% { transform: translate3d(-2.5%, -10%, 0) rotateZ(-7.5deg); }
  25%    { transform: translate3d(0, 0, 0) rotateZ(-7.5deg); }
  31.25% { transform: translate3d(0, -12.5%, 0) rotateZ(0); }
  37.5%  { transform: translate3d(0, -2.5%, 0) rotateZ(0); }
  43.75% { transform: translate3d(0, -12.5%, 0) rotateZ(0); }
  50.0%  { transform: translate3d(0, -2.5%, 0) rotateZ(0); }
  56.25% { transform: translate3d(0, 0%, 0) rotateZ(12.5deg); }
  62.5%  { transform: translate3d(0, 0%, 0) rotateZ(-2.5deg); }
  68.75% { transform: translate3d(0, 0%, 0) rotateZ(2.5deg); }
  75%    { transform: translate3d(0, 0%, 0) rotateZ(-12.5deg); }
  81.25% { transform: translate3d(2.5%, -10%, 0) rotateZ(7.5deg); }
  87.5%  { transform: translate3d(0, 0, 0) rotateZ(7.5deg); }
  93.75% { transform: translate3d(-2.5%, -10%, 0) rotateZ(-7.5deg); }
  100%   { transform: translate3d(0, 0, 0) rotateZ(0); }
}

.limb.arm {
  stroke-width: ${limbWidth}px;
}
  </style>
  <!-- nb. We can't use clipPath, as Edge doesn't render it in .drawImage() -->

  <g class="${this._isDancing ? 'dance' : ''}" @click="${this.dance}">
    <g transform="translate(30, 30) ${scaleAt(scale, scale, 130, 428.65)}">

      <!-- legs -->
      <path class="limb" d="M112.51,389.94v${- (legLength + 100) / scale}"/>
      <path class="limb" d="M147.49,389.94v${- (legLength + 100) / scale}"/>

      <!-- feet and buckles -->
      <path class="high1" d="M68.15,389.94a19.36,19.36,0,0,0,19.36,19.35h0a15,15,0,0,0,15-15V379.94h20v43.7a5,5,0,0,1-5,5H68.62c-10.5,0-19.43-8.16-19.81-18.65A19.35,19.35,0,0,1,68.15,389.94Z"/>
      <path class="high2" d="M102.51,399.29H110a5,5,0,0,0,0-10h-7.51a5,5,0,1,0,0,10Z"/>
      <path class="high1" d="M191.85,389.94a19.36,19.36,0,0,1-19.36,19.35h0a15,15,0,0,1-15-15V379.94h-20v43.7a5,5,0,0,0,5,5h48.89c10.5,0,19.43-8.16,19.81-18.65A19.35,19.35,0,0,0,191.85,389.94Z"/>
      <path class="high2" d="M157.49,399.29H150a5,5,0,1,1,0-10h7.51a5,5,0,0,1,0,10Z"/>
    </g>

    <!-- top part -->
    <g transform="translate(160, ${80 - legLength}) rotate(${bodyDegrees}, 0, 280)">

      <!-- hat (first, before body) -->
      <g transform="translate(-105, -18)">
        <g class="hats">${defs.categoryChoice(this.categoryChoice, 'hats')}</g>
      </g>

      <!-- body and belt -->
      <g transform="${scaleAt(Math.pow(scale, 0.5), Math.pow(scale, 0.25), 0, 202.7)}" class="suit">
        ${defs.body}
        <rect class="high1" x="-42.66" y="259.76" width="85.32" height="21.32"/>
        <rect class="high2" x="-10.66" y="258.76" width="21.32" height="23.32"/>
      </g>

      <!-- left arm -->
      <g transform="translate(-10, 216) scale(+1, -1)">
        ${this._buildArm(leftArmDegrees, shrug, armLength)}
      </g>

      <!-- right arm -->
      <g transform="translate(+10, 216) scale(-1, -1)">
        ${this._buildArm(rightArmDegrees, shrug, armLength)}
      </g>

      <!-- head -->
      <g transform="translate(-105, -18)">
        ${defs.head}
        <g class="hair">${defs.categoryChoice(this.categoryChoice, 'hair')}</g>
        <g class="glasses">${defs.categoryChoice(this.categoryChoice, 'glasses')}</g>
        <g class="ears">${defs.categoryChoice(this.categoryChoice, 'ears')}</g>
        <g class="accessories">${defs.categoryChoice(this.categoryChoice, 'accessories')}</g>
      </g>
    </g>
  </g>
</svg>
</div>
    `;
  }
}

customElements.define('maker-elf', MakerElfElement);
