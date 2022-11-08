const EventEmitter = mw.dataMaps.EventEmitter,
    Util = mw.dataMaps.Util,
    Enums = mw.dataMaps.Enums,
    MarkerGroupEditor = require( './widgets/markerGroupEditor.js' );


module.exports = class MapVisualEditor extends EventEmitter {
    constructor( map ) {
        super();
        
        this.map = map;
        this.revisionId = mw.config.get( 'wgCurRevisionId' );

        this.map.storage.isWritable = false;
        this.map.storage.dismissed = [];

        $( '<div class="datamap-ve-info-bar datamap-ve-beta-notice">' )
            .text( mw.msg( 'datamap-ve-beta-notice' ) )
            .prependTo( this.map.$root.find( '.datamap-container-top' ) );

        $( '<div class="datamap-ve-info-bar warning">' )
            .text( mw.msg( 'datamap-ve-limited-preview-notice' ) )
            .prependTo( this.map.$root.find( '.datamap-holder' ).parent() );

        this.windowManager = new OO.ui.WindowManager();
        $( 'body' ).append( this.windowManager.$element );

        this.toolFactory = new OO.ui.ToolFactory();
        this.groupFactory = new OO.ui.ToolGroupFactory();
        this.toolbar = new OO.ui.Toolbar( this.toolFactory, this.groupFactory, {
            actions: true
        } );

        // Push a CSS class onto the map container
        this.map.$root.addClass( 'datamap-is-ve-active' );

        this.map.$status.show().text( mw.msg( 'datamap-ve-loading' ) );
        
        // Register tools
        this.toolFactory.register( require( './tools/commit.js' ) );
        this.toolFactory.register( require( './tools/sourceEditor.js' ) );
        this.toolFactory.register( require( './tools/addMarker.js' ) );

        // Set up the toolbar
        this.toolbar.setup( [
            {
                type: 'bar',
                include: [ 'addMarker' ]
            },
            {
                type: 'bar',
                include: [ 'sourceEditor', 'commit' ]
            }
        ] );
        this.toolbar.$element.prependTo( this.map.$root.find( '.datamap-holder' ).parent() );
        this.toolbar.initialize();
        this.toolbar.emit( 'updateState', {
            ve: this
        } );

        this.map.on( 'legendLoaded', this._enhanceGroups, this );

        require( './editablePopup.js' );

        this._requestRevisionData();
    }


    _requestRevisionData() {
        this.map.streaming.callApiReliable( {
            action: 'query',
            prop: 'revisions',
            titles: mw.config.get( 'wgPageName' ),
            rvstartid: this.revisionId,
            rvlimit: 1,
            rvprop: 'content',
            rvslots: 'main'
        } )
            .then( data => {
                this.sourceData = JSON.parse( data.query.pages[this.map.id].revisions[0].slots.main['*'] );

                if ( !this.sourceData.markers ) {
                    this.sourceData.markers = {};
                }

                const markerStore = {};
                for ( const layers in this.sourceData.markers ) {
                    markerStore[layers] = [];
                    for ( const raw of this.sourceData.markers[layers] ) {
                        const apiInstance = [ raw.y || raw.lat, raw.x || raw.lon, {
                            raw,
                            ve: this,
                            _ve_invalidate: [ '_ve_parsed_desc', '_ve_parsed_label' ],
                            article: raw.article
                        } ];
                        markerStore[layers].push( apiInstance );
                    }
                }

                this.map.waitForLeaflet( () => {
                    this.map.instantiateMarkers( markerStore );
                    this.map.fire( 'chunkStreamingDone' );
                    // DEPRECATED(v0.13.0:v0.14.0): old event name
                    this.map.fire( 'streamingDone' );
                } );
            } )
            .catch( () => this.map.$status.show().html( mw.msg( 'datamap-error-dataload' ) ).addClass( 'error' ) );

        
        const streamingCallback = () => {
            this.map.off( 'chunkStreamingDone', streamingCallback );

            this.map.$status.hide();
        };
        this.map.on( 'chunkStreamingDone', streamingCallback );
    }


    _enhanceGroups() {
        // Hide the mass-visibility toggle button group
        this.map.markerLegend.buttonGroup.toggle( false );
        // Rename the tab
        this.map.markerLegend.tab.tabItem.setLabel( mw.msg( 'datamap-ve-legend-tab-marker-groups' ) );

        // Rebuild every marker group toggle into editor widgets
        for ( const groupToggle of Object.values( this.map.markerLegend.groupToggles ) ) {
            groupToggle.veWidget = new MarkerGroupEditor( this, groupToggle );
        }
    }


    markStale( obj ) {
        obj._ve_stale = true;

        if ( obj._ve_invalidate ) {
            for ( const field of obj._ve_invalidate ) {
                delete obj[field];
            }
        }
    }


    destroyMarkerGroup( groupId ) {
        this.map.markerLegend.groupToggles[groupId].field.$element.remove();
        delete this.map.markerLegend.groupToggles[groupId];
        delete this.map.config.groups[groupId];
        delete this.sourceData.groups[groupId];
        this.map.layerManager.nuke( groupId );
        this.map.layerManager.deregister( groupId );
    }
}