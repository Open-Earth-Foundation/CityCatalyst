import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
urls={
 'candidate-metadata':'https://api.github.com/repos/cxp114/criticalmaas-uncharted-ta1',
 'candidate-tree':'https://api.github.com/repos/cxp114/criticalmaas-uncharted-ta1/git/trees/HEAD?recursive=1',
 'candidate-releases':'https://api.github.com/repos/cxp114/criticalmaas-uncharted-ta1/releases',
 'candidate-readme':'https://raw.githubusercontent.com/cxp114/criticalmaas-uncharted-ta1/HEAD/README.md',
 'uncharted-tree':'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1/git/trees/HEAD?recursive=1',
 'lab-website':'https://knowledge-computing.github.io/',
 'lab-criticalmaas-site':'https://knowledge-computing.github.io/criticalmaas-web/',
 'lab-criticalmaas-tree':'https://api.github.com/repos/knowledge-computing/criticalmaas-web/git/trees/HEAD?recursive=1',
 'lab-packages':'https://api.github.com/orgs/knowledge-computing/packages?package_type=container',
 'inferlink-packages':'https://api.github.com/orgs/InferLink/packages?package_type=container',
 'darpa-packages':'https://api.github.com/orgs/DARPA-CRITICALMAAS/packages?package_type=container',
 'ta1-evaluation-tree':'https://api.github.com/repos/DARPA-CRITICALMAAS/TA1-Evaluation/git/trees/HEAD?recursive=1',
 'cdr-examples-tree':'https://api.github.com/repos/DARPA-CRITICALMAAS/cdr_client_examples/git/trees/HEAD?recursive=1',
 'docker-topaz-search-page2':'https://hub.docker.com/v2/search/repositories/?page=2&page_size=100&query=topaz',
 'docker-jterstriep-topaz':'https://hub.docker.com/v2/repositories/jterstriep/topaz/',
 'docker-mapsense-search':'https://hub.docker.com/v2/search/repositories/?query=mapsense&page_size=100',
 'ghcr-lab-package-page':'https://github.com/orgs/knowledge-computing/packages?repo_name=CriticalMAAS_AIM',
 'legend-releases':'https://api.github.com/repos/knowledge-computing/criticalmaas-legend-detection/releases',
 'legend-tree':'https://api.github.com/repos/knowledge-computing/criticalmaas-legend-detection/git/trees/HEAD?recursive=1',
 'hf-polygon-models':'https://huggingface.co/api/models?search=polygon&limit=100',
 'hf-geologic-models':'https://huggingface.co/api/models?search=geologic&limit=100',
 'hf-topaz-cryomodel-card':'https://huggingface.co/scitomo/topaz-v0.2.4-unet-l2-2d/raw/main/README.md',
}
dest=ROOT/'configs/expanded-probes.json'
if dest.exists():raise RuntimeError('Already configured')
dest.write_text(json.dumps([dict(name=k,url=v) for k,v in urls.items()],indent=2),encoding='utf-8')
print(f'Prepared {len(urls)} probes')
