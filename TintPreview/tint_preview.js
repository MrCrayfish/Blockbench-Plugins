/*
	Tint Preview - A Blockbench plugin to preview tint effect on JSON models
	Copyright (C) 2022  MrCrayfish

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
var showTint = false;
var tintColor = [1.0, 0.705, 0.294];
var origMats = [];

(function() {
	var toggleTintAction;
	var setTintColorAction;
	var colorPickerDialog;
	var colorPicker;  

	Plugin.register('tint_preview', {
		title: 'Tint Preview',
		author: 'MrCrayfish',
		description: 'Preview color on tint enabled faces! (JSON models only)',
		icon: 'fa-fill',
		version: '0.0.1',
		variant: 'both',
		onload() {
			window.Language.addTranslations('en', {
				'dialog.tint_preview.set_tint_color': 'Set Tint Color'
			});

			// Hook to patch textures when added
			Blockbench.on('add_texture', (data) => {
				patchTextureShader(Project, data.texture);
			});

			// Patches all current textures loaded in valid porjects
			patchAllTextures(); 

			// Causes any changes to face tint toggle to update the tint preview
			Blockbench.on('finish_edit', function(data) {
				if(Object.keys(Undo.current_save.elements).length && data.aspects.elements.length) {
					let obj = data.aspects.elements[0];
					let oldObj = Undo.current_save.elements[obj.uuid];
					function faceChanged(a, b) {
						return a.tint != b.tint;
					}
					for(let f of Canvas.face_order) {
						if(faceChanged(obj.faces[f], oldObj.faces[f])) {
							updateTint();
							break;
						}
					}
				}
			});

			toggleTintAction = new Action({
				id: 'toggle_tint_preview',
				name: 'Toggle Tint Preview',
				icon: 'fa-fill',
				description: 'Toggles the tint effect for tint enabled faces',
				category: 'tools',
				condition: () => isTintingFormat(Format),
				click: () => {
					toggleTint();
					toggleTintAction.setIcon(showTint ? 'fa-fill-drip' : 'fa-fill');
				}
			});

			setTintColorAction = new Action({
				id: 'set_tint_color',
				name: 'Set Tint Color',
				icon: 'fa-palette',
				description: 'Toggles the tint effect for tint enabled faces',
				category: 'tools',
				condition: () => isTintingFormat(Format),
				click: () => {
					colorPickerDialog.show();
					$('#blackout').hide();
					open_dialog = false; // Hack to allow keybinds to work
				}
			});

			// Adds the actions to the tools menu
			MenuBar.addAction(toggleTintAction, 'tools');
			MenuBar.addAction(setTintColorAction, 'tools');
			MenuBar.update();

			// Adds the actions to the texture panel
			Toolbars.texturelist.children.safePush(toggleTintAction);
			Toolbars.texturelist.children.safePush(setTintColorAction);
			Toolbars.texturelist.update(); // Fixes an issue where reloading the plugin wouldn't update the toolbar

			var saved_colors = localStorage.getItem('tint_colors');
			if (saved_colors) {
				try {
					saved_colors = JSON.parse(saved_colors);
				} catch (err) {
					saved_colors = null;
				}
			}

			// Setup state memory
			StateMemory.init('tint_color_picker_tab', 'string')
			StateMemory.init('tint_color_wheel', 'boolean')

			/* Dialog that shows a color picker. Code based on color picker in the Blockbench. */
			colorPickerDialog = new Dialog({
				id: 'select_tint_color_dialog',
				title: 'dialog.tint_preview.set_tint_color',
				singleButton: true,
				width: 400,
				darken: false,
				component: {
					data: {
						width: 352,
						open_tab: StateMemory.tint_color_picker_tab || 'picker',
						picker_type: StateMemory.tint_color_wheel ? 'wheel' : 'box',
						picker_toggle_label: tl('panel.color.picker_type'),
						tint_color: '#ffb64c',
						hover_color: '',
						get color_code() {
							return this.hover_color || this.tint_color
						},
						set color_code(color) {
							this.tint_color = color.toLowerCase().replace(/[^a-f0-9#]/g, '');
						},
						text_input: '#ffb64c',
						hsv: {
							h: 36,
							s: 70,
							v: 100,
						},
						palette: (saved_colors && saved_colors.palette instanceof Array) ? saved_colors.palette : palettes.default.slice(),
						history: (saved_colors && saved_colors.history instanceof Array) ? saved_colors.history : []
					},
					methods: {
						togglePickerType() {
							StateMemory.tint_color_wheel = !StateMemory.tint_color_wheel;
							StateMemory.save('tint_color_wheel');
							this.picker_type = StateMemory.tint_color_wheel ? 'wheel' : 'box';
						},
						sort(event) {
							var item = this.palette.splice(event.oldIndex, 1)[0];
							this.palette.splice(event.newIndex, 0, item);
						},
						drop(event) {
						},
						setColor(color) {
							colorPickerDialog.set(color);
						},
						validateMainColor() {
							var color = this.tint_color;
							if (!color.match(/^#[0-9a-f]{6}$/)) {
								this.tint_color = tinycolor(color).toHexString();
							}
						},
						isDarkColor(hex) {
							if (hex) {
								let color_val = new tinycolor(hex).getBrightness();
								let bg_val = new tinycolor(CustomTheme.data.colors.back).getBrightness();
								return Math.abs(color_val - bg_val) <= 50;
							}
						},
						tl
					},
					watch: {
						tint_color: function(value) {
							this.hover_color = '';
							Object.assign(this.hsv, ColorPanel.hexToHsv(value));
							colorPickerDialog.set(value);
							$('#tint_colorpicker').spectrum('set', value);
							this.text_input = value;
						},
						open_tab(tab) {
							StateMemory.tint_color_picker_tab = tab;
							StateMemory.save('tint_color_picker_tab');
							Vue.nextTick(() => {
								$('#tint_colorpicker').spectrum('reflow');
							})
						}
					},
					template: `
						<div id="tint_color_panel_wrapper" class="panel_inside">
							<div id="color_panel_head">
								<div class="main" v-bind:style="{'background-color': hover_color || tint_color}"></div>
								<div class="side">
									<input type="text" v-model="color_code" @focusout="validateMainColor()">
									<div id="color_history">
										<li
											v-for="(color, i) in history" v-if="i || color != tint_color"
											:key="color"
											v-bind:style="{'background-color': color}"
											v-bind:title="color" @click="setColor(color)"
										></li>
									</div>
								</div>
							</div>

							<div class="bar tabs_small">

								<input type="radio" name="tab" id="radio_tint_color_picker" value="picker" v-model="open_tab">
								<label for="radio_tint_color_picker">${tl('panel.color.picker')}</label>

								<input type="radio" name="tab" id="radio_tint_color_palette" value="palette" v-model="open_tab">
								<label for="radio_tint_color_palette">${tl('panel.color.palette')}</label>

								<input type="radio" name="tab" id="radio_tint_color_both" value="both" v-model="open_tab">
								<label for="radio_tint_color_both">${tl('panel.color.both')}</label>

								<div class="tool" @click="togglePickerType()" :title="picker_toggle_label">
									<i class="fa_big icon" :class="picker_type == 'box' ? 'fas fa-square' : 'far fa-stop-circle'"></i>
								</div>

							</div>
							<div v-show="open_tab == 'picker' || open_tab == 'both'">
								<div v-show="picker_type == 'box'" ref="square_picker" :style="{maxWidth: width + 'px'}">
									<input id="tint_colorpicker">
								</div>
								<color-wheel v-if="picker_type == 'wheel' && width" v-model="tint_color" :width="width" :height="width"></color-wheel>
								<div class="toolbar_wrapper color_picker" toolbar="color_picker"></div>
							</div>
							<div v-show="open_tab == 'palette' || open_tab == 'both'">
								<div class="toolbar_wrapper palette" toolbar="palette"></div>
								<ul id="palette_list" class="list" v-sortable="{onUpdate: sort, onEnd: drop, fallbackTolerance: 10}" @contextmenu="ColorPanel.menu.open($event)">
									<li
										class="color" v-for="color in palette"
										:title="color" :key="color"
										:class="{selected: color == tint_color, contrast: isDarkColor(color)}"
										@click="setColor(color)"
										@mouseenter="hover_color = color"
										@mouseleave="hover_color = ''"
									>
										<div class="color_inner" v-bind:style="{'background-color': color}"></div>
									</li>
								</ul>
							</div>
						</div>
					`,
					mounted() {
						colorPicker = $(this.$el).find('#tint_colorpicker').spectrum({
							preferredFormat: "hex",
							color: 'ffb64c',
							flat: true,
							localStorageKey: 'brush_color_palette',
							move: function(c) {
								colorPickerDialog.change(c);
							}
						})
					}
				}
			});
			colorPickerDialog.change = function(color) {
				var value = new tinycolor(color)
				colorPickerDialog.content_vue._data.tint_color = value.toHexString();
				setTintColor(value);
			}
			colorPickerDialog.set = function(color, no_sync) {
				colorPickerDialog.change(color)
			}
			colorPickerDialog.get = function() {
				return colorPickerDialog.content_vue._data.tint_color;
			}
		},
		onunload() {
			toggleTintAction.delete();
			setTintColorAction.delete();
			Toolbars.texturelist.children.remove(toggleTintAction);
			Toolbars.texturelist.children.remove(setTintColorAction);
			restoreOriginalMaterials();
		}
	});
})();

// Accepts a tinycolor
function setTintColor(color) {
	let rgb = color.toRgb();
	let r = rgb.r / 255.0;
	let g = rgb.g / 255.0;
	let b = rgb.b / 255.0;
	tintColor = [r, g, b];
	if(showTint) updateTint();
}

/**
 * Toggles the tint preview
 */
function toggleTint() {
	showTint = !showTint;
	updateTint();
}

/**
 * Updates the color atrribute on the cube geometry. Faces that that have tint
 * enabled will recieve the tint color while other faces will just recieve a
 * white tint.
 */
function updateTint() {
	Outliner.elements.forEach(obj => {
		const geometry = obj.mesh.geometry;
		const positionAttribute = geometry.getAttribute('position');
		const colors = new Array(positionAttribute.count * 3);
		colors.fill(1); // Fill with white
		function setTintColor(face, rgb) {
			let index = Canvas.face_order.indexOf(face);
			if(index == -1) return;
			let startIndex = index * 12;
			for(let i = 0; i < 12; i++) {
	            colors[startIndex + i] = rgb[i % 3];
		    }
		}
		for(let key in obj.faces) {
			let face = obj.faces[key];
			if(face.tint != -1 && showTint) {
				setTintColor(face.direction, tintColor); //TODO make configurable
			} else {
				setTintColor(face.direction, [1.0, 1.0, 1.0]);
			}
		}
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	});
}

/**
 * Patches the texture in the given project with a custom material. The shader
 * has been based on the original texture shader, just with the inclusion to 
 * apply a vertex color. The tint calculation is the same as Minecraft, that being
 * "texture * tint".
 */
function patchTextureShader(project, texture) {
	var originalMat = project.materials[texture.uuid];
	var vertShader = `
			attribute float highlight;

			uniform bool SHADE;

			varying vec3 vColor;
			varying vec2 vUv;
			varying float light;
			varying float lift;

			float AMBIENT = 0.5;
			float XFAC = -0.15;
			float ZFAC = 0.05;

			void main() {
				if (SHADE) {
					vec3 N = normalize( vec3( modelMatrix * vec4(normal, 0.0) ) );
					float yLight = (1.0+N.y) * 0.5;
					light = yLight * (1.0-AMBIENT) + N.x*N.x * XFAC + N.z*N.z * ZFAC + AMBIENT;
				} else {
					light = 1.0;
				}
				if (highlight == 2.0) {
					lift = 0.22;
				} else if (highlight == 1.0) {
					lift = 0.1;
				} else {
					lift = 0.0;
				}
				vColor = color;
				vUv = uv;
				vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
				gl_Position = projectionMatrix * mvPosition;
			}`
		var fragShader = `
			#ifdef GL_ES
			precision ${isApp ? 'highp' : 'mediump'} float;
			#endif

			uniform sampler2D map;

			uniform bool SHADE;
			uniform bool EMISSIVE;
			uniform float BRIGHTNESS;

			varying vec3 vColor;
			varying vec2 vUv;
			varying float light;
			varying float lift;

			void main(void) {
				
				vec4 color = texture2D(map, vUv);
				if (color.a < 0.01) 
					discard;
				if (EMISSIVE == false) {
					color = vec4(lift + color.rgb * light * BRIGHTNESS, color.a);
				} else {
					float light2 = (light * BRIGHTNESS) + (1.0 - light * BRIGHTNESS) * (1.0 - color.a);
					color = vec4(lift + color.rgb * light2, 1.0);
				}
				if (lift > 0.2) {
					color.r = color.r * 0.6;
					color.g = color.g * 0.7;
				}
				vec4 tint = vec4(vColor.rgb, 1.0);
				gl_FragColor = color * tint;
			}`
		var mat = new THREE.ShaderMaterial({
			uniforms: {
				map: {type: 't', value: originalMat.map},
				SHADE: {type: 'bool', value: settings.shading.value},
				BRIGHTNESS: {type: 'bool', value: settings.brightness.value / 50},
				EMISSIVE: {type: 'bool', value: texture.render_mode == 'emissive'}
			},
			vertexShader: vertShader,
			fragmentShader: fragShader,
			side: Canvas.getRenderSide(),
			vertexColors: true,
			transparent: true,
		});
		mat.map = originalMat.map;
		mat.name = texture.name;
		project.materials[texture.uuid] = mat;

		// Store the original mat for restoring
		origMats[texture.uuid] = originalMat;
}

/**
 * Patches all textures in opened projects that support tinting with custom material. 
 * Refer to #isTintingFormat(format) for the condition of a project to support tinting.
 */
function patchAllTextures() {
	if(!ModelProject.all.length)
		return;
	let count = 0;
	ModelProject.all.forEach(project => {
		if(isTintingFormat(project.format)) {
			let textures = project.textures;
			textures.forEach(texture => {
				patchTextureShader(project, texture);
				count++;
			});
		}
	});
	console.log(`[Tint Preview] Patched ${count} textures`);
}

/**
 * Restores the original materials for all textures in opened projects. Any
 * reminant materials (from closed projects) will simply be purged.
 */
function restoreOriginalMaterials() {
	if(ModelProject.all.length) {
		let count = 0;
		ModelProject.all.forEach(project => {
			if(isTintingFormat(project.format)) {
				let textures = project.textures;
				textures.forEach(texture => {
					let origMat = origMats[texture.uuid];
					if(origMat) {
						project.materials[texture.uuid] = origMat;
						count++;
					}
				});
			}
		});
		console.log(`[Tint Preview] Patched ${count} textures`);
	}
	origMats.purge();
}

/**
 * Checks if the format supports tinting. Support for other formats can be added by
 * adding "allowTinting = true" onto the format instance on creation.
 */
function isTintingFormat(format) {
	return format.id == 'java_block' || format.allowTinting;
}