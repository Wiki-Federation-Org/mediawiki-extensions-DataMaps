<?php
namespace Ark\DataMaps\Rendering;

use Ark\DataMaps\Data\DataMapSpec;
use Ark\DataMaps\Data\DataMapGroupSpec;
use MediaWiki\MediaWikiServices;
use Title;
use Parser;
use ParserOutput;
use OutputPage;
use ParserOptions;
use Html;
use File;
use InvalidArgumentException;
use PPFrame;

class DataMapEmbedRenderer {
    public DataMapSpec $data;

    private Title $title;
    private Parser $parser;
    private ParserOptions $parserOptions;

    public function __construct( Title $title, DataMapSpec $data, Parser $parser ) {
        $this->title = $title;
        $this->data = $data;

        $this->parser = $parser->getFreshParser();
        $this->parserOptions = $parser->getOptions();

        $parser->getOptions()->enableLimitReport(false);
    }

    public function getId(): int {
        return $this->title->getArticleID();
    }

    private function getFile( string $title ): File {
        $file = MediaWikiServices::getInstance()->getRepoGroup()->findFile( trim( $title ) );
        if (!$file || !$file->exists()) {
            throw new InvalidArgumentException( "File [[File:$title]] does not exist." );
        }
		return $file;
    }

    private function getIconUrl( string $title ): string {
        return $this->getFile( $title )->getURL();
    }

    public function prepareOutput(ParserOutput &$parserOutput) {
        // Enable and configure OOUI
        $parserOutput->setEnableOOUI( true );
		\OOUI\Theme::setSingleton( new \OOUI\WikimediaUITheme() );
		\OOUI\Element::setDefaultDir( 'ltr' );

        // Required modules
        $parserOutput->addModules( [
            'ext.ark.datamaps.leaflet.core',
            'ext.ark.datamaps.loader'
        ] );

        // Inject mw.config variables via a `dataMaps` map from ID
        $configsVar = [
            $this->getId() => $this->getJsConfigVariables()
        ];
        if ( array_key_exists( 'dataMaps', $parserOutput->mJsConfigVars ) ) {
            $configsVar = array_merge( $parserOutput->mJsConfigVars['dataMaps'], $configsVar );
        }
        $parserOutput->addJsConfigVars( 'dataMaps', $configsVar );

        // Register image dependencies
		$parserOutput->addImage( $this->data->getImageName() );
        $this->data->iterateGroups( function(DataMapGroupSpec $spec) use (&$parserOutput) {
            $parserOutput->addImage( $spec->getMarkerIcon() );
            $parserOutput->addImage( $spec->getLegendIcon() );
        } );
    }

    public function getJsConfigVariables(): array {
        $image = $this->getFile($this->data->getImageName());
        $out = [
            // Required to query the API for marker clusters
            'pageName' => $this->title->getPrefixedText(),
            'version' => $this->title->getLatestRevID(),

            'coordinateBounds' => $this->data->coordinateBounds,
            'image' => $image->getURL(),
            'imageBounds' => [ $image->getWidth(), $image->getHeight() ],
            
            'groups' => [],
            'layerIds' => $this->data->getLayerNames(),
            'leafletSettings' => $this->data->getInjectedLeafletSettings(),

            'custom' => $this->data->getCustomData()
        ];

        $this->data->iterateGroups( function(DataMapGroupSpec $spec) use (&$out) {
            $out['groups'][$spec->getId()] = $this->getMarkerGroupConfig($spec);
        } );

        return $out;
    }

    public function getMarkerGroupConfig(DataMapGroupSpec $spec): array {
        $out = array(
            'name' => $spec->getName(),
            'size' => $spec->getSize(),
        );

        switch ( $spec->getDisplayMode() ) {
            case DataMapGroupSpec::DM_CIRCLE:
                $out['fillColor'] = $spec->getFillColour();
                break;
            case DataMapGroupSpec::DM_ICON:
                $out['markerIcon'] = $this->getIconUrl( $spec->getMarkerIcon() );
                break;
            default:
                throw new InvalidArgumentException( wfMessage( 'datamap-error-render-unsupported-displaymode', $spec->getDisplayMode() ) );
        }

        if ( $spec->getLegendIcon() !== null ) {
            $out['legendIcon'] = $this->getIconUrl( $spec->getLegendIcon() );
        }

        return $out;
    }

    public function getMarkerLayerConfig(string $name): array {
        //$info = $this->data->groups->$name;
        return array(
        );
    }

    private function expandWikitext(string $source): string {
        return $this->parser->parse( $source, $this->title, $this->parserOptions )->getText();
    }

    public function getHtml( DataMapRenderOptions $options ): string {
        // Primary slots
		$containerMain = new \OOUI\PanelLayout( [
            'id' => 'datamap-' . $this->getId(),
            'classes' => [ 'datamap-container' ],
			'framed' => true,
			'expanded' => false,
			'padded' => false
		] );
		$containerTop = new \OOUI\PanelLayout( [
            'classes' => [ 'datamap-container-top' ],
			'framed' => false,
			'expanded' => false,
			'padded' => false
		] );
		$containerContent = new \OOUI\PanelLayout( [
            'id' => 'datamap-' . $this->getId(),
            'classes' => [ 'datamap-container-content' ],
			'framed' => false,
			'expanded' => false,
			'padded' => true
		] );

        // Stack the containers
        $containerMain->appendContent( $containerTop );
        $containerMain->appendContent( $containerContent );

        // Bar at the top with map title
        if ( $options->displayTitle ) {
            $titleText = $options->titleOverride ?? $this->data->getTitle();
            $containerTop->appendContent( new \OOUI\LabelWidget( [
                'label' => new \OOUI\HtmlSnippet( $this->expandWikitext( $titleText ) )
            ] ) );
        }

        // Left-side legend
        $containerContent->appendContent( $this->getLegendContainerWidget() );

        // Leaflet area
		$containerMap = new \OOUI\PanelLayout( [
			'framed' => true,
			'expanded' => false,
		] );
        $containerMap->appendContent( new \OOUI\HtmlSnippet( $this->getLeafletContainerHtml() ) );
        $containerContent->appendContent( $containerMap );

        return $containerMain;
    }

    public function getLegendContainerWidget(): \OOUI\Widget {
        $legend = new \OOUI\Widget( [
            'classes' => [ 'datamap-container-legend' ]
        ] );

        $legend->appendContent( new \OOUI\LabelWidget( [
            'label' => wfMessage( 'datamap-legend-label' ),
            'classes' => [ 'datamap-legend-label' ]
        ] ) );

        return $legend;
    }

    public function getLeafletContainerHtml(): string {
		return Html::rawElement(
			'div',
			[
				'class' => 'datamap-holder'
			],
            Html::element(
                'noscript',
                null,
                wfMessage( 'datamap-javascript-required' )
            )
            . Html::element(
				'div',
				[
					'class' => 'datamap-status'
				],
				wfMessage( 'datamap-placeholder-loading' )
			)
		);
    }
}