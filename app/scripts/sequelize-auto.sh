#!/bin/bash
shift
npx sequelize-auto -h localhost -d citycatalyst -u citycatalyst --dialect postgres -o src/models -l ts --caseProp c --additional scripts/model-params.json -T SequelizeMeta "$@"
