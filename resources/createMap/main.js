const CreationDialog = require( './creationDialog.js' );

module.exports = function () {
    if ( mw.config.get( 'wgArticleId' ) === 0 && mw.config.get( 'wgPageContentModel' ) === 'datamap' ) {
        const windowManager = new OO.ui.WindowManager();
        windowManager.on( 'closing', ( window, closed, data ) => {
            closed.done( () => {
                windowManager.destroy();
            } );
        } );
        $( 'body' ).append( windowManager.$element );

        const dialog = new CreationDialog( {
            size: 'large'
        } );
        windowManager.addWindows( [ dialog ] );
        windowManager.openWindow( dialog );
    }
};