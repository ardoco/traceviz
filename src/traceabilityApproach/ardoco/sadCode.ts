import { ARDOCO_TRACE_LINK_TYPE } from '../../types';
import { generateTraceLinks, TraceLinkApproach } from './generateTraceLinks';

const SAD_CODE_APPROACH: TraceLinkApproach = {
    traceLinkType: ARDOCO_TRACE_LINK_TYPE.SAD_CODE,
    displayName: 'ArDoCode (SAD-Code)',
    idPrefix: 'sad-code',
    requiresArchitectureModel: false,
    csvPrefix: 'sad-code-results',
};

export async function generateSadCodeTraceLinks(): Promise<void> {
    return generateTraceLinks(SAD_CODE_APPROACH);
}
