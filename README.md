# DataMaps extension

This is free software licensed under the GNU General Public License. Please
see http://www.gnu.org/copyleft/gpl.html for further details, including the
full text and terms of the license.

## Overview
A more modern, prototype replacement for ARK Wiki's [interactive maps on DOM nodes](https://ark.wiki.gg/wiki/Module:ResourceMap).
Built on top of [Leaflet](https://leafletjs.com/). If frontend is unproven due to performance issues, stack can be rewritten onto
the old display while keeping the benefits - which are speed, reduced server load (same work in hacky Lua is done in PHP), better
automation possibilities with bots (extracted data imports), and less data transfered to the browser.

Currently no feature parity with the existing solution. [Roadmap (T75 on wiki's Trello board)](https://trello.com/c/CiLfCspG/75-datamaps-extension-for-fjordurs-release).

[Test installation link (may be broken)](https://1.37.wiki-dev.mglolenstine.xyz/wiki/Map_transclusion_01).

## Installation
If your wiki is hosted on [wiki.gg](https://wiki.gg), simply request the extension via their representatives.

Manual installation:
1. Clone the repository to `extensions/DataMaps`.
2. `wfLoadExtension` in site configuration.
3. Set `$wgDataMapsNamespaceId` to the ID of the Data namespace (`10006` on ARK Wiki).

### MediaWiki support schedule
This extension's development tracks [wiki.gg](https://wiki.gg)'s platform - currently MediaWiki **1.37**. All versioned releases
of DataMaps target this version, and only this version. Not much official support is provided for other versions of the platform.

Branches targeting other versions of MediaWiki may end up being developed as a rolling release fork of the mainline. They'll be
promoted when wiki.gg migrates to the corresponding version. No backports will be ever done.

This is simply because of limited resources and the lack of external users. However, if you need the extension on newer MediaWiki
outside of the schedule above, please [inform us](https://ark.wiki.gg/wiki/User_talk:Alex4401).

## Creating a map
Create a page within the data namespace and assign it the `datamap` content model.

### Structure
Content of the page should be a valid JSON with following structure:
* `$mixin` (boolean, optional): if `true` forces the map to be recognised as a preset/mix-in and relaxes validation.
* `mixins` (array of page names, optional): *experimental*, list of other pages with the `datamap` content model that'll be loaded first and stacked to share configuration.
* `crs` (box, optional): reference coordinate space, which also determines whether the system origin will be top-left or bottom-left. Defaults to `[ [0, 0], [100, 100] ]`, which is top-left - swap the points for bottom-left.
* `image` (file name, required, allowed only if `backgrounds` is not specified): name of the file (with no namespace) to display as background. This translates to a single, nameless background.
* `backgrounds` (array of objects): list of *backgrounds* this map has available and the user can choose between:
* * `name` (string, required if more than one background is specified): name of this background to display in the selection control.
* * `image` (file name, required): name of the file to display for this background.
* * `at` (box, optional): location to place the background at.
* * `associatedLayer` (string, optional): if specified, the background will toggle on the `bg:VALUE` layer instead of `bg:INDEX`.
* * `overlays` (array of objects, optional): list of *background overlay* specifications:
* * * `name` (string, optional): name shown in a tooltip when the mouse cursor is over the overlay.
* * * Images:
* * * * `image` (file name, required): name of an image to display.
* * * * `at` (dimensions, required): bounds of the image.
* * * Rectangles:
* * * * `at` (dimensions, required): bounds of the rectangle.
* * * * `color` (colour, supports transparency, optional): colour to fill the rectangle with.
* * * Polylines:
* * * * `path` (array of locations, required): list of points the path should go through sequentially.
* * * * `color` (colour, supports transparency, optional): colour to display the line with.
* * * * `thickness` (number, optional): thickness of the line.
* `hideLegend` (boolean, optional): if `true` does not show or load the legend at all. Defaults to `false`.
* `enableSearch` (boolean, optional): if `true` enables marker search for this map. Controlled by `$wgDataMapsDefaultFeatures` identified by `Search`.
* `showCoordinates` (boolean, optional): if `true` displays coordinates on mouse move and inside popups. Controlled by `$wgDataMapsDefaultFeatures` identified by `ShowCoordinates`.
* `showLegendAbove` (boolean, optional): if `true` always displays the legend above the map. Controlled by `$wgDataMapsDefaultFeatures` identified by `ShowLegendAlwaysAbove`.
* `sortChecklistsByAmount` (boolean, optional): if `true` sorts checklists by the number of markers inside. Controlled by `$wgDataMapsDefaultFeatures` identified by `SortChecklistsByAmount`.
* `disableZoom` (boolean, optional): if `true` locks the map into zoom level of `2.75` (adjustable with `leafletSettings`), disables the zoom control and zoom interactions.
* `requireCustomMarkerIDs` (boolean, optional): if `true` requires the `id` property to be always present on markers. Controlled by `$wgDataMapsDefaultFeatures` identified by `RequireCustomMarkerIDs`.
* `leafletSettings` (object, optional): settings to pass to Leaflet's map instance.
* * [Check Leaflet's documentation for valid options.](https://leafletjs.com/reference.html#map-option) Only simple (strings, booleans and numbers) options are supported. There is always a possibility of conflicts.
* * Common:
* * * `maxZoom`: controls max allowed zoom level. Defaults to `5`.
* * * `minZoom`: controls minimum allowed zoom level. Defaults to `1.75` on mobile devices and `2` on others.
* * `rendererSettings` (object, optional): options to pass to the canvas renderer. [Check Leaflet's documentation for valid options.](https://leafletjs.com/reference.html#canvas-option)
* `groups` (string to object map, required): map from name to a *marker group* specification:
* * `name` (string, required): name of the group and each individual marker.
* * **Circular markers:** if `fillColor` is specified
* * * `fillColor` (colour, required): colour of each circular marker belonging to the group.
* * * `icon` (file name, optional): icon to show in the legend.
* * * `size` (integer, optional): size of each circular marker. Defaults to `4`.
* * **Icon markers:** if `fillColor` is **not** specified
* * * `icon` (file name, required): name of the file (with no namespace) to show markers with. This makes all markers in group SVG-based. Current support is limited.
* * * `size` (dimensions, optional): size of each icon marker. Defaults to `[ 32, 32 ]`.
* * `article` (page name, optional): name of an article every marker's popup should link to. Can be overridden on a marker.
* * `isCollectible` (optional):
* * * `true` or `individual`: whether markers of this group can be marked as collected by users.
* * `autoNumberInChecklist` (boolean, optional): if collectible and true, markers in the checklist will have their index number added to the name.
* `layers` (string to object map, optional): map from name to a *marker layer* specification:
* * Marker layers can be used without an explicit declaration.
* * `name` (string, required): currently unused.
* * `subtleText` (string, optional): text that will be displayed next to coordinates in a marker's popup. Coordinates must be enabled server-side for this.
* * `overrideIcon` (file name, optional): if specified, this layer will override the icons of each marker assigned to it. If the marker has multiple of such layers, only the first one is used.
* `markers` (string to array of objects map, required): map from group name (and any secondary specifiers, i.e. "layers") to an array of *markers*:
* * `id` (string or number, optional): a persistent unique identifier to use for collectibles and URL linking instead of a generated storage key.
* * `lat`/`y` (decimal, required): latitude/`Y` coordinate.
* * `lon`/`x` (decimal, required): longitude/`X` coordinate.
* * `name` (string, optional): text to append to marker's popup title.
* * * This field was called `label` before version 0.11.3, but support will be removed in 0.13.0.
* * `description` (string or string array, optional): text to add to the marker's popup.
* * `isWikitext` (boolean, optional): if true, `label` and `description` will be treated as wikitext. This is expensive, do not use for every marker. If unset, the backend will guess based on the presence of some patterns.
* * `image` (file name, optional): if provided, marker's popup will display this image under the description.
* * * This field was called `popupImage` before version 0.11.3, but support will be removed in 0.13.0.
* * `article` (page name, optional): article the marker's popup should link to. Follows either a format of `article title` or `article title|displayed label`.
* * `searchKeywords` (string, or array of strings or string and number (score multiplier) pairs, optional): specifies what keywords this marker will be suggested for.
* `custom` (map, optional): any arbitrary to be added to the client-side map config, for use with e.g. on-site gadgets.

#### File name
A file name of an image. The image **must exist**. Currently `File:` prefix is not required, but supported only in its English form.

#### `Colour`
Either a three element array of integers in `0..255` range, or a 3- or 6-long hex string beginning with `#`, representing an RGB colour with no transparency.

#### `Colour`, with transparency
Either a four element array of integers in `0..255` range, or a 4- or 8-long hex string beginning with `#`, representing an RGBA colour (i.e. with an alpha channel).

#### `Dimensions`
Two element decimal array, where first element is the width and second is the height. Alternatively, a number, which will be
used for both axes.

#### `Location`
Two element decimal array, where first element is the latitude and second is the longitude.

#### `Box`
Box is a array of two locations, where first describes the start point of the box and second describes the end point.

### Parser functions
* `DataMap`: used to embed a map in an article.
* * Takes an optional `filter` parameter, which is a comma-delimited list of layers to show.
* * Example: `{{DataMap:Maps/Resources/Aberration|filter=metal,crystal|title=Metal and crystal locations on [[Aberration]]}}`.

## Configuration
* `$wgDataMapsNamespaceId`: namespace where data maps will be allowed. **Must be set.**
* `$wgDataMapsCacheType`: cache type to use for `queryDataMap` API endpoint output. Defaults to `CACHE_ANYTHING`.
* `$wgDataMapsCacheTTL`: time after which cached `queryDataMap` API endpoint responses expire. Set to `0` to disable caching. Defaults to `86400` (a day).
* `$wgDataMapsExtendCacheTTL`: if not `false`, extends TTL to `override` of cached maps on requests `threshold` seconds away from expiry. Defaults to `[ 'threshold' => 43200, 'override' => 57600 ]`.
* `$wgDataMapsMarkerParserExpansionLimit`: controls wikitext parser expansion size limit for each marker. Defaults to `800`.
* `$wgDataMapsUseInProcessParserCache`: whether wikitext parsing requests will be cached within the process (up to 128 entries). This can save a significant amount of time if marker descriptions or labels repeat often, but increases memory usage. Defaults to `true`.
* `$wgDataMapsDefaultFeatures`: controls whether certain features are enabled by default on a map without a specific override in its source.
* * `$wgDataMapsDefaultFeatures['ShowCoordinates']`: whether coordinates will be displayed in the user interface. Defaults to `true`.
* * `$wgDataMapsDefaultFeatures['ShowLegendAlwaysAbove']`: whether the legend will be displayed above the map. Defaults to `false`.
* * `$wgDataMapsDefaultFeatures['RequireCustomMarkerIDs']`: whether the `id` property will be required on markers. Defaults to `false`.
* * `$wgDataMapsDefaultFeatures['Search']`: whether marker search will be enabled by default. Defaults to `false`.
* * `$wgDataMapsDefaultFeatures['SortChecklistsByAmount']`: whether collectible checklists will be sorted by number of markers inside. Defaults to `false`.
* `$wgDataMapsReportTimingInfo`: if set to `true`, marker processing time will be reported in API responses. Defaults to `false`.
* `$wgDataMapsAllowExperimentalFeatures`: if set to `true`, enables features listed below - all of which are in development and not ready for production. Defaults to `false`.
* * Collectible checklists

## General architecture
The `DataMapContent` class handles data validation (on write only), and customised source beautification.

`DataMapEmbedRenderer` is either invoked when displaying the source page or via the `DataMap` parser function (class
`ParserFunction_EmbedDataMap`). It generates a basic HTML structure to host the map and delivers immediate configuration needed
to initialise the map client-side. This configuration is sent via the `dataMaps` mw.config variable, and each map uses its page
ID for identification (`mw.config.get('dataMaps')[page ID]`) when multiple maps are present on one page.

Markers are not sent to the browser immediately, and have to be requested with the `ApiQueryDataMapEndpoint`. This allows
initialisation to start while markers are being downloaded from the server, and decouples a large payload from the HTML document,
which has been a problem previously.

## Gadgets
External scripts can hook into Data Maps to provide additional functionality without modifying core code.

* All Leaflet APIs are public and left exposed under `window.L`. 
* * Custom Leaflet layers are exposed under `window.L.Ark`.
* * Lazy-loaded. Depend (via `mw.loader.using`) on `ext.ark.datamaps.leaflet.core` and `ext.ark.datamaps.leaflet.extra` respectively.
* * `DataMap` objects provide `waitForLeaflet( function callback )`.
* All public APIs of this extension are exposed under `window.mw.dataMaps`. Check `resources/loader/index.js` for all exposed classes.
* `mw.dataMaps.subscribeHook( string hookName, function callback )` may be used to register a hook callback for every map on current page. `hookName` must not include the `ext.ark.datamaps` namespace. The callback receives one parameter, a `DataMap` instance.
* * Depend (via `mw.loader.using`) on `ext.ark.datamaps.bootstrap` to use this.
* * Prior to version 0.10.0, this was `mw.subscribeDataMapsHook`. The entrypoint still exists but will be removed in v0.11.0.
* Alternatively, a `ext.ark.datamaps.broadcastMaps( id[] )` hook is provided to retrieve only IDs of Data Maps initialised on current page.
* Instance hooks:
* * `ext.ark.datamaps.afterInitialisation.[id]( DataMap )`: called after the `DataMap` instance is created, and secondary modules and marker data set have been requested.
* * `ext.ark.datamaps.afterLegendInitialisation.[id]( DataMap )`: called after OOUI loads and the legend panel is set up.
* Refer to the source code for information about the classes.

## Leaflet
This repository only includes a static build of modified Leaflet. Source code including the modifications is found under
[this link](https://github.com/alex4401/Leaflet/).

### Gadget implications
Certain Leaflet features may not be available when using DataMaps, check the forked repository for more details.