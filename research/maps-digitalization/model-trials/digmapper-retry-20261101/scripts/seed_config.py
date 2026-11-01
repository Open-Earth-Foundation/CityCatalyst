import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
urls={
 'paper-abs':'https://arxiv.org/abs/2506.16006',
 'paper-latest-html':'https://arxiv.org/html/2506.16006',
 'paper-api':'https://export.arxiv.org/api/query?id_list=2506.16006',
 'aim-metadata':'https://api.github.com/repos/knowledge-computing/CriticalMAAS_AIM',
 'aim-contents':'https://api.github.com/repos/knowledge-computing/CriticalMAAS_AIM/contents',
 'aim-releases':'https://api.github.com/repos/knowledge-computing/CriticalMAAS_AIM/releases',
 'aim-branches':'https://api.github.com/repos/knowledge-computing/CriticalMAAS_AIM/branches',
 'aim-deployments':'https://api.github.com/repos/knowledge-computing/CriticalMAAS_AIM/deployments',
 'lab-repos':'https://api.github.com/orgs/knowledge-computing/repos?per_page=100',
 'inferlink-repos':'https://api.github.com/orgs/InferLink/repos?per_page=100',
 'criticalmaas-repos':'https://api.github.com/orgs/DARPA-CRITICALMAAS/repos?per_page=100',
 'github-digmapper':'https://api.github.com/search/repositories?q=DIGMAPPER',
 'github-topaz-geologic':'https://api.github.com/search/repositories?q=TOPAZ+geologic',
 'github-topaz-polygon':'https://api.github.com/search/repositories?q=TOPAZ+polygon',
 'github-topaz-criticalmaas':'https://api.github.com/search/repositories?q=TOPAZ+CriticalMAAS',
 'github-polygon-inferlink':'https://api.github.com/search/repositories?q=polygon+org%3AInferLink',
 'author-project':'https://sofiakirsanova.github.io/projects/criticalmaas/',
 'inferlink-mapsense':'https://www.inferlink.com/mapsense',
 'hf-digmapper-models':'https://huggingface.co/api/models?search=digmapper&limit=100',
 'hf-topaz-models':'https://huggingface.co/api/models?search=topaz&limit=100',
 'hf-criticalmaas-models':'https://huggingface.co/api/models?search=criticalmaas&limit=100',
 'hf-digmapper-spaces':'https://huggingface.co/api/spaces?search=digmapper&limit=100',
 'hf-topaz-spaces':'https://huggingface.co/api/spaces?search=topaz&limit=100',
 'docker-digmapper-search':'https://hub.docker.com/v2/search/repositories/?query=digmapper&page_size=100',
 'docker-topaz-search':'https://hub.docker.com/v2/search/repositories/?query=topaz&page_size=100',
 'docker-criticalmaas-search':'https://hub.docker.com/v2/search/repositories/?query=criticalmaas&page_size=100',
 'docker-inferlink':'https://hub.docker.com/v2/repositories/inferlink/?page_size=100',
 'docker-knowledge-computing':'https://hub.docker.com/v2/repositories/knowledgecomputing/?page_size=100',
 'quay-digmapper':'https://quay.io/api/v1/find/repositories?query=digmapper',
 'quay-topaz':'https://quay.io/api/v1/find/repositories?query=topaz',
 'uncharted-metadata':'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1',
 'uncharted-releases':'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1/releases',
 'uncharted-build-workflow':'https://raw.githubusercontent.com/DARPA-CRITICALMAAS/uncharted-ta1/main/.github/workflows/build_containers.yml',
 'docker-lara-tags':'https://hub.docker.com/v2/repositories/uncharted/lara-segmentation/tags/?page_size=100',
 's3-layout-config-yaml':'https://pantera-file-test.s3.ca-central-1.amazonaws.com/lara/segmentation/layoutlmv3_20240925/config.yaml',
 's3-layout-config-json':'https://pantera-file-test.s3.ca-central-1.amazonaws.com/lara/segmentation/layoutlmv3_20240925/config.json',
 's3-layout-weights':'https://pantera-file-test.s3.ca-central-1.amazonaws.com/lara/segmentation/layoutlmv3_20240925/model_final.pth',
 's3-layout-weights-global':'https://pantera-file-test.s3.amazonaws.com/lara/segmentation/layoutlmv3_20240925/model_final.pth',
}
rows=[dict(name=k,url=v,**({'range':'bytes=0-4095'} if 'weights' in k else {})) for k,v in urls.items()]
dest=ROOT/'configs/seed-probes.json'
if dest.exists():raise RuntimeError('Already configured')
dest.write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(f'Prepared {len(rows)} public HTTP probes')
