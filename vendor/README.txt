Giriş sayfasındaki 3B uçak için gömülü (vendored) kütüphaneler. Çalışma anında CDN kullanılmaz.

three.js r170 (npm: three@0.170.0), MIT lisansı, Copyright 2010-2024 Three.js Authors -> LICENSE-three.txt
  three.module.min.js         build/three.module.min.js (değiştirilmedi)
  GLTFLoader.js               examples/jsm/loaders/GLTFLoader.js
  BufferGeometryUtils.js      examples/jsm/utils/BufferGeometryUtils.js
  RoomEnvironment.js          examples/jsm/environments/RoomEnvironment.js
  meshopt_decoder.module.js   examples/jsm/libs/meshopt_decoder.module.js (meshoptimizer, MIT, Arseny Kapoulkine;
                              lisans başlığı dosyanın içinde)

Tek değişiklik: import yolları yerel yapıldı ("from 'three'" -> "from './three.module.min.js'",
"'../utils/BufferGeometryUtils.js'" -> "'./BufferGeometryUtils.js'"); import map gerekmez.

Güncelleme: npm pack three@<sürüm>, aynı dosyaları kopyalayıp aynı sed değişikliğini yapın, bu dosyadaki sürümü yazın.

Model: ../assets/sahi-siha.glb — SAHI_SIM/sahi_sim/models/mini_talon_vtail/meshes_cad/*.dae dosyalarından
(gövde, uç kanatlar, kanatçıklar, motor, burun kubbesi) fast-simplification ile ~25.5k üçgene indirildi,
32° kırık açısıyla normaller hesaplandı, merkezlendi (glTF: +X burun, +Y yukarı), gltfpack 0.25 ile
nicemlendi + EXT_meshopt_compression ile sıkıştırıldı. Model herkese açıktır (giriş sayfası şifresizdir).
