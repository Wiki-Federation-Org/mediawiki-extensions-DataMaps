<?php
namespace MediaWiki\Extension\DataMaps\Migration;

use Content;
use Html;
use HTMLForm;
use JsonContentHandler;
use MediaWiki\Content\Renderer\ContentParseParams;
use MediaWiki\Content\ValidationParams;
use RequestContext;
use JsonContent;
use MediaWiki\Extension\DataMaps\Constants;
use MediaWiki\Extension\DataMaps\ExtensionConfig;
use MediaWiki\MediaWikiServices;
use Title;
use ParserOutput;


class ForeignMapContentHandler extends JsonContentHandler {
    public function __construct( $modelId = CONTENT_MODEL_DATAMAPS_FANDOM_COMPAT ) {
        parent::__construct( $modelId, [ CONTENT_MODEL_DATAMAPS_FANDOM_COMPAT ] );
    }

    protected function getContentClass() {
        return ForeignMapContent::class;
    }

    /**
     * Only allow this content handler to be used in the configured data namespace
     */
    public function canBeUsedOn( Title $title ) {
        $config = MediaWikiServices::getInstance()->get( ExtensionConfig::SERVICE_NAME );

        if ( $title->getNamespace() !== $config->getNamespaceId() ) {
            return false;
        }

        return parent::canBeUsedOn( $title );
    }

    protected function fillParserOutput( Content $content, ContentParseParams $cpoParams, ParserOutput &$parserOutput ) {
        /** @var JsonContent $content */

        $pageRef = $cpoParams->getPage();
        $parserOptions = $cpoParams->getParserOptions();
        $shouldGenerateHtml = $cpoParams->getGenerateHtml();
        $parserOutput = new ParserOutput();

        $parserOutput->setRobotPolicy( 'noindex,follow' );

        if ( $shouldGenerateHtml ) {
            $form = HTMLForm::factory( 'ooui', [
                'type' => [
                    'type' => 'select',
                    'name' => 'type',
                    'label-message' => 'datamapmigrate-foreigntype',
                    'required' => true,
                    'options-messages' => [
                        'datamapmigrate-foreigntype-fandom' => 'fandom',
                    ],
                ],
            ], RequestContext::getMain(), 'datamapmigrate' );
            $form->setSubmitTextMsg( 'datamapmigrate-submit' );
            $form->show();
        }
    }
}
